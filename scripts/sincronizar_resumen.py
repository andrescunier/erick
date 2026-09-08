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
import os
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

ARTIFACTS_DIR = Path(r"C:\andybot\opentransit\emova\tenants\artifacts")

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


def _ultimo_resumen(carpeta_tenant: Path) -> dict[str, Any] | None:
    """El business_summary.json mas reciente de este tenant, o None si no hay
    ninguno. "Mas reciente" se decide por el nombre de la carpeta de corrida
    (run_id), que es un timestamp ordenable como texto (YYYYMMDDHHMMSS)."""
    candidatos = sorted(
        carpeta_tenant.glob("*/*/structured/business_summary.json"),
        key=lambda p: p.parent.parent.name,  # la carpeta run_id
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

    tenants: dict[str, Any] = {}
    saltados: list[str] = []

    for carpeta in sorted(ARTIFACTS_DIR.iterdir()):
        if not carpeta.is_dir():
            continue
        crudo = _ultimo_resumen(carpeta)
        if crudo is None:
            saltados.append(carpeta.name)
            continue
        tenants[carpeta.name] = {campo: crudo.get(campo) for campo in CAMPOS_RELEVANTES}

    print(f"{len(tenants)} tenants con datos, {len(saltados)} sin business_summary.json todavia.")
    if saltados:
        print("  sin datos:", ", ".join(saltados))

    return {"generado_en": datetime.now().isoformat(), "tenants": tenants}


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
    resumen = _armar_resumen()
    _publicar(resumen)


if __name__ == "__main__":
    main()
