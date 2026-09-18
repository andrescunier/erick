"""Publica el estado de flota de OTmonitor en leandro/otmonitor.

Lee el JSON que ya escribio el ciclo propio de leandro (otmonitor_ciclo.py,
cada 15-20 min contra alarmbot) y lo republica tal cual -no vuelve a
consultar nada, es solo el paso de lectura+POST, igual que sincronizar_emision.py
con `leandro/eventos`.

py scripts/sincronizar_otmonitor.py --output .preview/otmonitor.json
py scripts/sincronizar_otmonitor.py  # publica por ERICK_API_URL / ERICK_API_KEY
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from sincronizar_resumen import _publicar

SALIDA_DEFAULT = Path(
    os.environ.get("ERICK_OTMONITOR_ARCHIVO", r"C:\andybot\leandro\otmonitor_datos\estado_flota.json")
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Vista previa local sin publicar")
    parser.add_argument("--archivo", type=Path, default=SALIDA_DEFAULT, help="JSON que escribe otmonitor_ciclo.py")
    args = parser.parse_args()

    if not args.archivo.exists():
        raise SystemExit(f"No existe {args.archivo}. ¿Corrió alguna vez otmonitor_ciclo.py en leandro?")

    try:
        result = json.loads(args.archivo.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise SystemExit(f"No se pudo leer {args.archivo}: {exc}") from exc

    kpis = result.get("kpis") or {}
    print(
        f"OTmonitor: {kpis.get('total_monitoreados', 0)} dispositivos, "
        f"{kpis.get('en_linea', 0)} en línea ({kpis.get('en_linea_pct', 0)}%), "
        f"{kpis.get('con_fallas_hw', 0)} con fallas HW. Generado: {result.get('generado_en', 'desconocido')}."
    )

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"Vista previa: {args.output}. No se publicó.")
    else:
        _publicar(result, usuario="leandro", proyecto="otmonitor")


if __name__ == "__main__":
    main()
