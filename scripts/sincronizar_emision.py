"""Publica Leandro en leandro/emision, separado de opentransit/resumen.

py scripts/sincronizar_emision.py --output .preview/emision.json
py scripts/sincronizar_emision.py  # publica por ERICK_API_URL / ERICK_API_KEY
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from leandro_analytics import build_emision, load_catalog
from sincronizar_resumen import _publicar


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Vista previa local sin publicar")
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--eventos", type=Path, default=Path(os.environ.get("ERICK_LEANDRO_DIR", r"C:\andybot\leandro\eventos")))
    args = parser.parse_args()
    if not 1 <= args.days <= 365:
        parser.error("--days debe estar entre 1 y 365")
    try:
        resolve = load_catalog(args.eventos.parent / "app" / "catalogo.py")
        result = build_emision(args.eventos, resolve, days=args.days)
    except (OSError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc
    p = result["_procedencia"]
    print(f"Emisión: {p['eventos_unicos']} notificaciones únicas, {p['entidades_observadas']} entidades observadas, {len(result['_analytics']['datasets'])} vistas.")
    for warning in result["_analytics"]["warnings"]:
        print("  aviso:", warning)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"Vista previa: {args.output}. No se publicó.")
    else:
        _publicar(result, usuario="leandro", proyecto="emision")


if __name__ == "__main__":
    main()
