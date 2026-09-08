"""Adaptadores de CSV locales a datasets analíticos portables; nunca ejecuta queries.

Sólo se publican dimensiones y métricas agregadas de una lista explícita.
Las fotos sucesivas de AlarmBot se superponen: se usa la última, no se suman.
"""
from __future__ import annotations

import csv
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
import re


def metric(key, label, money=False, denominator=None, scale=None):
    result = {"key": key, "label": label, "format": "money_cents" if money else "count"}
    if denominator:
        result["denominator"] = denominator
    if scale is not None:
        result.update(scale=scale, format="percent")
    return result


# Campo fuente -> campo público. Los montos BI están en pesos; se convierten
# con Decimal a centavos, igual que el resto del contrato de Erick.
SPECS = [
    ("resumen_diario", "Recaudación y viajes", [],
     {"dinero_procesado": "monto_cents", "cantidad_taps": "taps", "volumen_transaccional": "transacciones"},
     [metric("monto_cents", "Monto procesado", True), metric("taps", "Taps"), metric("transacciones", "Transacciones"), metric("monto_cents", "Ticket por tap", True, "taps")],
     "Histórico diario del proceso. Monto procesado no equivale a dinero efectivamente cobrado. Ticket = monto / taps del período filtrado."),
    ("detalle_estados", "Estados de presentación y taps", ["tipo_estado", "estado"],
     {"cantidad": "cantidad", "monto": "monto_cents"},
     [metric("monto_cents", "Monto", True), metric("cantidad", "Cantidad")],
     "PRESENTACION y TAP describen los mismos viajes desde perspectivas distintas. Elegí un tipo para evitar contarlos dos veces. UNPAID identifica presentación sin cobrar."),
    ("detalle_marcas", "Marcas de tarjeta", ["marca"],
     {"cantidad": "cantidad", "monto": "monto_cents"},
     [metric("monto_cents", "Monto", True), metric("cantidad", "Cantidad")],
     "Distribución por marca de los registros procesados; no contiene identificadores de tarjetas."),
    ("detalle_medios_pago", "Medios de pago", ["medio_pago"],
     {"cantidad": "cantidad", "monto": "monto_cents"},
     [metric("monto_cents", "Monto", True), metric("cantidad", "Cantidad")],
     "Distribución de los registros procesados por medio de pago."),
    ("detalle_recovery", "Recuperos", [],
     {"total_registros": "cantidad", "monto_total": "monto_cents", "tipo_MIT_monto": "mit_cents", "tipo_CIT_monto": "cit_cents"},
     [metric("monto_cents", "Monto en RECOVERY", True), metric("cantidad", "Registros"), metric("mit_cents", "Monto MIT", True), metric("cit_cents", "Monto CIT", True)],
     "Importes del archivo RECOVERY. No se suman a recaudación ni se asumen liquidación bancaria; son una fuente separada."),
    ("detalle_vqr", "VQR y descuentos", [],
     {"total_registros": "viajes", "monto_bruto": "bruto_cents", "monto_neto": "neto_cents", "net_amount_cero": "neto_cero"},
     [metric("viajes", "Viajes VQR"), metric("bruto_cents", "Monto bruto", True), metric("neto_cents", "Monto neto", True), metric("neto_cero", "Viajes con neto cero", denominator="viajes", scale=100)],
     "Montos bruto y neto informados por VQR. Neto cero no significa por sí solo un subsidio incorrecto."),
]


def number(value, money=False):
    try:
        n = Decimal(str(value))
        if not n.is_finite():
            return None
        return int((n * 100).quantize(Decimal("1"))) if money else float(n)
    except (InvalidOperation, ValueError, TypeError):
        return None


def day(value):
    text = str(value)
    for fmt in ("%Y%m%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(text[:10] if "-" in text else text, fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError(f"Fecha inválida: {text!r}")


def read_bi(root, spec, cutoff):
    name, title, dimensions, fields, metrics, description = spec
    path = root / f"{name}.csv"
    # Se elige el reproceso más reciente para cada tenant/día completo: si un
    # estado desaparece en el reproceso, no se conserva el estado de la corrida vieja.
    groups = {}
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=";")
        required = {"fecha", "tenant", *dimensions, *fields}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError(f"Columnas requeridas ausentes en {path.name}")
        for row in reader:
            fecha = day(row["fecha"])
            if fecha < cutoff:
                continue
            key = (fecha, row["tenant"])
            run = (row.get("process_ts", ""), row.get("process_run_id", ""))
            old_run, entries = groups.get(key, (run, {}))
            if run < old_run:
                continue
            if run > old_run:
                entries = {}
            values = [fecha, row["tenant"], *[row[d] for d in dimensions],
                      *[number(row[k], v.endswith("_cents")) for k, v in fields.items()]]
            entries[tuple(row[d] for d in dimensions)] = values
            groups[key] = (run, entries)
    return {"id": name, "title": title, "description": description, "source": str(path), "mode": "history", "cadenceMinutes": 1440,
            "updatedAt": datetime.fromtimestamp(path.stat().st_mtime).astimezone().isoformat(),
            "columns": ["fecha", "tenant", *dimensions, *fields.values()],
            "dimensions": ["tenant", *dimensions], "metrics": metrics,
            "rows": [r for key in sorted(groups) for r in groups[key][1].values()]}


def read_alarm(root, buses):
    query = "control_ativo_48hs_buses" if buses else "control_ativo_48hs_emova"
    pattern = re.compile(r"^\d{8}_\d{6}_" + ("buses" if buses else "subte") + r"_main_" + query + r"\.csv$")
    paths = sorted(p for p in root.glob(f"*_{query}.csv") if pattern.fullmatch(p.name))
    if not paths:
        raise FileNotFoundError(query)
    path = paths[-1]
    rows = []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not {"ativo", "hora", "cantidad", *(["Base"] if buses else [])}.issubset(reader.fieldnames or []):
            raise ValueError(f"Columnas requeridas ausentes en {path.name}")
        for row in reader:
            hour = datetime.fromisoformat(row["hora"]).isoformat(timespec="seconds")
            rows.append([hour, row["Base"] if buses else "EMOVA", row["ativo"], number(row["cantidad"])])
    return {"id": query, "title": "Operación buses" if buses else "Pendientes EMOVA", "mode": "snapshot", "cadenceMinutes": 30 if buses else 60,
            "description": ("Última foto disponible, por hora de sam_dt (zona horaria de la base, sin conversión). "
                "Ativo 0 → 1 es el ciclo habitual; otros estados requieren revisión. No se asignan severidades automáticamente. "
                + ("Buses: cuenta registros de mtt_log; no prueba deuda monetaria ni transacciones únicas. " if buses else
                   "EMOVA: sólo filas vinculadas a confirmation_pend, con estado 0/255; no representa el total de taps. ")
                + "Las exportaciones pueden usar parámetros de fecha: el CSV no registra la ventana solicitada; se muestra el rango observado."),
            "source": str(path), "updatedAt": datetime.strptime(path.name[:15], "%Y%m%d_%H%M%S").isoformat(),
            "columns": ["fecha", "base", "ativo", "cantidad"], "dimensions": ["base", "ativo"],
            "metrics": [metric("cantidad", "Registros en la foto")], "rows": rows}


def build_analytics(bi_root: Path, alarm_root: Path, days=30, today=None):
    today = today or datetime.now().date()
    cutoff = (today - timedelta(days=days - 1)).isoformat()
    datasets, warnings = [], []
    for spec in SPECS:
        try:
            d = read_bi(bi_root, spec, cutoff)
            # Tipos de estado se mantienen en datasets separados: son universos
            # superpuestos, por lo que ni el total ni la curva deben mezclarlos.
            if spec[0] == "detalle_estados":
                index = d["columns"].index("tipo_estado")
                for kind in sorted({r[index] for r in d["rows"]}):
                    split = {**d, "id": f"{d['id']}_{kind}", "title": f"Estados · {kind}",
                             "rows": [r for r in d["rows"] if r[index] == kind]}
                    if kind == "PRESENTACION":
                        amount_index = d["columns"].index("monto_cents")
                        state_index = d["columns"].index("estado")
                        split["columns"] = [*d["columns"], "no_cobrado_cents"]
                        split["rows"] = [r + [r[amount_index] if r[state_index] == "UNPAID" else 0]
                                         for r in split["rows"]]
                        split["metrics"] = [metric("no_cobrado_cents", "Sin cobrar", True),
                                            metric("no_cobrado_cents", "Sin cobrar / monto filtrado", denominator="monto_cents", scale=100),
                                            *d["metrics"]]
                    datasets.append(split)
            else:
                datasets.append(d)
            if not d["rows"]:
                warnings.append(f"{spec[1]}: sin filas desde {cutoff}; no equivale a actividad cero.")
        except (OSError, ValueError, csv.Error) as exc:
            warnings.append(f"{spec[1]}: fuente no disponible ({exc}).")
    for buses in (True, False):
        try:
            datasets.append(read_alarm(alarm_root, buses))
        except (OSError, ValueError, csv.Error) as exc:
            warnings.append(f"AlarmBot {'buses' if buses else 'EMOVA'}: fuente no disponible ({exc}).")
    return {"version": 1, "datasets": datasets, "warnings": warnings}
