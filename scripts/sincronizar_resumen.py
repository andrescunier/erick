"""Junta el ultimo business_summary.json de cada tenant de opentransit y lo
empuja al dashboard via API (POST /api/dashboards/{user}/{project}).

Por que un POST y no un archivo commiteado: el dashboard ahora guarda cada
proyecto como un JSON en el repo de GitHub, pero escrito por la API (que hace
el commit por vos), no por un `git push` manual. Este script solo arma el
JSON y lo manda — no toca git para nada.

Variables de entorno necesarias:
    ERICK_API_URL   ej. https://erick.vercel.app
    ERICK_API_KEY   el mismo valor que INGEST_API_KEY en Vercel
    ERICK_USER      opcional, default "opentransit"
    ERICK_PROJECT   opcional, default "resumen"

Uso: py scripts/sincronizar_resumen.py
"""

from __future__ import annotations

import json
import argparse
import os
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

ARTIFACTS_DIR = Path(r"C:\andybot\opentransit\emova\tenants\artifacts")
TENANTS_YAML = Path(r"C:\andybot\opentransit\config\tenants.yaml")

# De donde sale cada business_summary.json. Se declara aca para poder mostrarlo
# en el dashboard: si alguien pregunta "de donde sale este numero", la respuesta
# tiene que estar en la pantalla y no en la cabeza de quien escribio el sync.
INSUMOS_DEL_INFORME = (
    "BACKFILE, STPOP, DAILYTAPS, VQR, RECOVERY, STPOP de ayer y JT_EMOVA "
    "(CSV diarios de 2 servidores SFTP)"
)

# Los campos que le importan al dashboard. Se dejan afuera los desgloses mas
# finos (by_issuer, by_brand, by_line, by_payment_type, by_tap_state,
# by_presentation_state, source_files): son utiles pero todavia no hay una
# vista que los use, y cada uno de esos suma varios KB por tenant. Agregarlos
# cuando haga falta una pantalla que los muestre, no antes.
CAMPOS_RELEVANTES = (
    "tenant",
    "process_date",
    "process_ts",
    "transaction_volume",
    "money_processed_cents",
    "tap_count",
    "average_ticket_cents",
    "average_transaction_cents",
    "validators_active_day",
    "validators_active_7d",
    "money_per_validator_cents",
    "month_projection_cents",
    "unique_cards",
    "comparison_windows",
)


def _derivados(crudo: dict[str, Any]) -> dict[str, Any]:
    """Indicadores que el business_summary.json no trae hechos pero se calculan
    con lo que si trae. Van con nombre pensado para que el front los formatee
    solo: *_cents es plata, *_pct es tasa.

    Un dato que no se puede calcular vuelve None y NO 0: en un dashboard de
    recaudacion un 0 se lee como "esta todo cobrado", que es justo lo contrario
    de "no tengo el dato". El front muestra "—" para None.
    """
    salida: dict[str, Any] = {}

    # Cobrabilidad. by_presentation_state = {PAID, UNPAID, ZERO} con cantidad y
    # monto_cents; UNPAID es plata devengada que no se cobro. Es el indicador de
    # recaudacion mas directo que ya estaba en el resumen y se descartaba.
    # Ojo: 2 de los 32 tenants (lersrl, tucuman) no traen el campo.
    presentacion = crudo.get("by_presentation_state") or {}
    if presentacion:
        total = sum((v or {}).get("monto_cents", 0) for v in presentacion.values())
        no_cobrado = (presentacion.get("UNPAID") or {}).get("monto_cents", 0)
        salida["no_cobrado_cents"] = no_cobrado
        salida["no_cobrado_pct"] = round(no_cobrado / total * 100, 2) if total else None
    else:
        salida["no_cobrado_cents"] = None
        salida["no_cobrado_pct"] = None

    # Validadores que tapearon en la ventana de 7 dias y hoy no. No es el parque
    # instalado (no existe padron: cada validador que el sistema conoce nace de
    # haber visto un tap suyo), pero es la mejor aproximacion disponible.
    activos_dia = crudo.get("validators_active_day")
    activos_7d = crudo.get("validators_active_7d")
    if isinstance(activos_dia, int) and isinstance(activos_7d, int):
        salida["validadores_sin_taps_7d"] = max(0, activos_7d - activos_dia)
    else:
        salida["validadores_sin_taps_7d"] = None

    taps = crudo.get("tap_count")
    tarjetas = crudo.get("unique_cards")
    salida["viajes_por_tarjeta"] = (
        round(taps / tarjetas, 2) if isinstance(taps, int) and tarjetas else None
    )

    return salida


def _normalizar_ventanas(ventanas: Any) -> Any:
    """El productor legacy usa ceros tambi?n cuando no tiene snapshot.

    Esa ventana es ambigua, no demuestra estabilidad. La marcamos sin dato
    en este adaptador de opentransit, sin cambiar el significado de cero en
    los dashboards de otros proyectos.
    """
    if not isinstance(ventanas, dict):
        return ventanas
    salida = {}
    for clave, ventana in ventanas.items():
        if isinstance(ventana, dict) and ventana and all(
            isinstance(v, (int, float)) and not isinstance(v, bool) and v == 0
            for v in ventana.values()
        ):
            salida[clave] = {k: None for k in ventana}
        else:
            salida[clave] = ventana
    return salida


def _tenants_declarados() -> set[str] | None:
    """Los tenants declarados en config/tenants.yaml de opentransit, o None si
    no se pudo leer. Sirve para distinguir un tenant real de una carpeta
    huerfana: el sync recorre el filesystem, y en artifacts/ hay carpetas que
    no estan declaradas en ninguna config."""
    try:
        import yaml  # pyyaml ya es dependencia de opentransit
    except ImportError:
        return None
    try:
        datos = yaml.safe_load(TENANTS_YAML.read_text(encoding="utf-8"))
        return set(datos.get("tenants", {}))
    except (OSError, ValueError, AttributeError, TypeError, yaml.YAMLError):
        return None


def _ultimo_resumen(carpeta_tenant: Path) -> dict[str, Any] | None:
    """El business_summary.json mas reciente de este tenant, o None si no hay
    ninguno.

    "Mas reciente" se ordena por (carpeta de fecha, run_id) y NO solo por
    run_id: la ruta es <tenant>/<fecha>/<run_id>/structured/, y el run_id es un
    timestamp de cuando corrio el proceso, no del dia que procesa. Ordenar solo
    por run_id hace que un reproceso de una fecha vieja lanzado hoy le gane al
    dia de ayer, y el dashboard muestre una fecha vieja sin avisar."""
    candidatos = sorted(
        carpeta_tenant.glob("*/*/structured/business_summary.json"),
        key=lambda p: (p.parent.parent.parent.name, p.parent.parent.name),
    )
    if not candidatos:
        return None
    try:
        return json.loads(candidatos[-1].read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return None


def _armar_resumen() -> dict[str, Any]:
    if not ARTIFACTS_DIR.exists():
        raise SystemExit(f"No encuentro {ARTIFACTS_DIR}. ¿Corre esto en la misma maquina que opentransit?")

    declarados = _tenants_declarados()
    if declarados is None:
        print("  aviso: no se pudo verificar tenants.yaml; no se validaron los tenants declarados.")
    tenants: dict[str, Any] = {}
    saltados: list[str] = []
    huerfanos: list[str] = []

    for carpeta in sorted(ARTIFACTS_DIR.iterdir()):
        if not carpeta.is_dir():
            continue
        crudo = _ultimo_resumen(carpeta)
        if crudo is None:
            saltados.append(carpeta.name)
            continue
        if declarados is not None and carpeta.name not in declarados:
            huerfanos.append(carpeta.name)
        tenants[carpeta.name] = {
            **{campo: crudo.get(campo) for campo in CAMPOS_RELEVANTES},
            **_derivados(crudo),
            "comparison_windows": _normalizar_ventanas(crudo.get("comparison_windows")),
        }

    print(f"{len(tenants)} tenants con datos, {len(saltados)} sin business_summary.json todavia.")
    if saltados:
        print("  sin datos:", ", ".join(saltados))
    if huerfanos:
        print(f"  {len(huerfanos)} sin declarar en tenants.yaml:", ", ".join(huerfanos))

    fechas = sorted(
        (t["process_date"], nombre) for nombre, t in tenants.items() if t.get("process_date")
    )

    # El front renderiza un campo llamado _procedencia como ficha aparte, no
    # como metrica. Es la respuesta a "de donde sale este numero".
    procedencia: dict[str, Any] = {
        "sistema": "opentransit — pipeline de archivos (no tiene base de datos ni API HTTP propia)",
        "informe": (
            f"business_summary.json ({len(CAMPOS_RELEVANTES)} de sus 26 campos) "
            "+ 4 indicadores derivados (no cobrado, validadores sin taps hoy, viajes por tarjeta)"
        ),
        "ruta": str(ARTIFACTS_DIR / "<tenant>" / "<fecha>" / "<run_id>" / "structured"),
        "insumos_del_informe": INSUMOS_DEL_INFORME,
        "sincronizado_por": "scripts/sincronizar_resumen.py",
        "sincronizado_en": datetime.now().isoformat(timespec="seconds"),
        "tenants_publicados": len(tenants),
    }
    if declarados is not None:
        procedencia["tenants_declarados_en_config"] = len(declarados)
        procedencia["tenants_sin_declarar"] = ", ".join(huerfanos) if huerfanos else "ninguno"
    if fechas:
        procedencia["dato_mas_nuevo"] = f"{fechas[-1][0]} ({fechas[-1][1]})"
        procedencia["dato_mas_viejo"] = f"{fechas[0][0]} ({fechas[0][1]})"

    return {
        "generado_en": datetime.now().isoformat(),
        "_procedencia": procedencia,
        "tenants": tenants,
    }


def _publicar(resumen: dict[str, Any]) -> None:
    api_url = os.environ.get("ERICK_API_URL")
    api_key = os.environ.get("ERICK_API_KEY")
    if not api_url or not api_key:
        raise SystemExit("Faltan ERICK_API_URL y/o ERICK_API_KEY en el entorno.")

    usuario = os.environ.get("ERICK_USER", "opentransit")
    proyecto = os.environ.get("ERICK_PROJECT", "resumen")

    url = f"{api_url.rstrip('/')}/api/dashboards/{usuario}/{proyecto}"
    payload = json.dumps(resumen).encode("utf-8")

    request = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as respuesta:
            print(f"Publicado en {url}: HTTP {respuesta.status}")
    except urllib.error.HTTPError as error:
        cuerpo = error.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Fallo el POST a {url}: HTTP {error.code} — {cuerpo}") from error


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Guardar una vista previa local sin publicar")
    parser.add_argument("--days", type=int, default=30, help="Días de histórico BI (default: 30)")
    args = parser.parse_args()
    if not 1 <= args.days <= 365:
        parser.error("--days debe estar entre 1 y 365")
    from analytics_csv import build_analytics

    resumen = _armar_resumen()
    resumen["_analytics"] = build_analytics(
        Path(os.environ.get("ERICK_BI_DIR", str(ARTIFACTS_DIR.parent / "datos_bi"))),
        Path(os.environ.get("ERICK_ALARMBOT_DIR", r"C:\andybot\alarmbot\output")),
        days=args.days,
    )
    datasets = resumen["_analytics"]["datasets"]
    print(f"Analítica: {len(datasets)} fuentes, {sum(len(d['rows']) for d in datasets)} filas.")
    for warning in resumen["_analytics"]["warnings"]:
        print(f"  aviso: {warning}")
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(resumen, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"Vista previa guardada: {args.output} ({args.output.stat().st_size:,} bytes). No se publicó.")
        return
    _publicar(resumen)


if __name__ == "__main__":
    main()
