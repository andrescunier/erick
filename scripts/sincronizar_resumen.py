"""Junta el ultimo business_summary.json de cada tenant de opentransit en un
solo archivo (data/resumen.json), que es lo que el dashboard de Next.js lee.

Por que un archivo commiteado y no una base de datos: el dashboard se aloja en
Vercel, los datos viven en esta maquina Windows (local/tailnet), y todavia no
hay ninguna base en la nube conectada. Un JSON en el repo es lo minimo que
funciona hoy: correr este script, commitear, pushear, y Vercel redeploya con
el dato nuevo. El dia que haga falta actualizar mas seguido que "cada vez que
alguien corre esto a mano", ahi si conviene una base de datos real — no antes.

Uso: py scripts/sincronizar_resumen.py
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

ARTIFACTS_DIR = Path(r"C:\andybot\opentransit\emova\tenants\artifacts")
SALIDA = Path(__file__).resolve().parent.parent / "data" / "resumen.json"

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


def main() -> None:
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

    resumen = {
        "generado_en": datetime.now().isoformat(),
        "tenants": tenants,
    }

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(resumen, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"{len(tenants)} tenants con datos, {len(saltados)} sin business_summary.json todavia.")
    if saltados:
        print("  sin datos:", ", ".join(saltados))
    print(f"Escrito: {SALIDA}")


if __name__ == "__main__":
    main()
