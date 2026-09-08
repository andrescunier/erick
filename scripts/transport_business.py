"""Consulta agregados de Alarmbot y conserva capturas, sin notificaciones ni datos personales."""
from __future__ import annotations
from datetime import datetime, timedelta
from pathlib import Path
import json
import gzip
import os
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
FIELDS = ["fecha", "empresa", "ativo", "estado", "taps", "monto_cents", "sin_importe", "consultado_en", "corte"]


def fetch_query(tenant, query, start, end):
    body = {"tenant_id": tenant, "sql_name": query, "notify": False,
            "save_output": False, "save_csv_output": True, "include_rows_in_response": True,
            "timeout_seconds": 15, "parameters": {"fecha_desde": start, "fecha_hasta": end}}
    url = os.environ.get("ERICK_ALARMBOT_URL", "http://127.0.0.1:8000").rstrip("/")
    request = urllib.request.Request(url + "/api/queries/execute", data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json"})
    result = json.load(urllib.request.urlopen(request, timeout=17))
    if result.get("status") != "success":
        raise ValueError("La consulta de Alarmbot no terminó correctamente")
    return result


def public_rows(result, end, bases):
    """Cero sólo cuando la consulta de la base y ventana terminó correctamente."""
    values = []
    measured = result["executed_at"]
    for row in result["rows"]:
        if row["base"] not in bases:
            raise ValueError("Base no declarada en la consulta")
        values.append([row["hora"], row["base"], str(row["ativo"]), str(row["estado"]),
                       int(row["taps"]), None if row["monto_cents"] is None else int(row["monto_cents"]),
                       int(row["sin_importe"]), measured, end])
    # Marcadores de cobertura: no son taps y permiten distinguir cero de falta de consulta.
    stop = datetime.fromisoformat(end)
    hour = stop.replace(hour=0, minute=0, second=0, microsecond=0)
    while hour < stop:
        for base in bases:
            values.append([hour.isoformat(), base, "cobertura", "cobertura", 0, 0, 0, measured, end])
        hour += timedelta(hours=1)
    return values


def build_live(now=None, directory=None, fetch=fetch_query):
    now = (now or datetime.now()).replace(microsecond=0)
    directory = directory or ROOT / ".sync" / "transporte"
    directory.mkdir(parents=True, exist_ok=True)
    alarm = Path(os.environ.get("ERICK_ALARMBOT_PROJECT", r"C:\andybot\alarmbot"))
    bases = json.loads((alarm / "SQL/_bases_buses.json").read_text(encoding="utf8"))["bases"]
    warnings, all_rows, checked = [], [], []
    for offset in (0, 1, 7):
        end = now - timedelta(days=offset)
        date = end.date().isoformat()
        for tenant, query, companies in (("buses", "Erick_Transporte_Horario_Buses", bases),
                                         ("subte", "Erick_Transporte_Horario", ["pms-emova-hml"])):
            cache = directory / f"{date}-{tenant}.json"
            try:
                result = fetch(tenant, query, date + "T00:00:00", end.isoformat())
                rows = public_rows(result, end.isoformat(), companies)
                payload = {"checked": result["executed_at"], "rows": rows}
                temporary = cache.with_suffix(".tmp")
                temporary.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf8")
                temporary.replace(cache)
                # Historial de lo observado, separado: nunca se suman capturas.
                history = directory / "capturas" / now.date().isoformat()
                history.mkdir(parents=True, exist_ok=True)
                with gzip.open(history / f"{now:%H%M%S}-{date}-{tenant}.json.gz", "wt", encoding="utf8") as handle:
                    json.dump(payload, handle, separators=(",", ":"))
            except Exception:
                warnings.append(f"Alarmbot {tenant}, {date}: consulta fallida. La última captura conserva su fecha; no se reemplaza por cero.")
                payload = json.loads(cache.read_text(encoding="utf8")) if cache.exists() else {"checked": None, "rows": [
                    [date + "T00:00:00", company, "cobertura_fallida", "cobertura_fallida", None, None, None, "", end.isoformat()]
                    for company in companies]}
            all_rows.extend(payload["rows"])
            if payload["checked"]:
                checked.append(payload["checked"])
    return {"id": "transporte_negocio_horario", "title": "Cobros y viajes durante el día", "mode": "snapshot",
            "cadenceMinutes": 5, "source": "Alarmbot · SQL Server · 32 empresas de buses y EMOVA",
            "updatedAt": min(checked) if checked else now.isoformat(),
            "description": "Regla de negocio confirmada: ativo 1 = cobrado; estados 0 y 255 = viaje. Monto = mtt_log.value en centavos. Se deduplica por token dentro de cada día, conservando la última fila. Fecha del viaje (sam_dt), no fecha bancaria del cobro. El estado se observa al consultar y puede cambiar; no es una reconstrucción de lo que se sabía ayer. Los importes faltantes no se estiman.",
            "columns": FIELDS, "dimensions": ["empresa", "ativo", "estado"],
            "metrics": [{"key": "taps", "label": "Taps observados", "format": "count"},
                        {"key": "monto_cents", "label": "Importe registrado", "format": "money_cents"}],
            "rows": all_rows}, warnings


def build_collection_history(live, directory=None):
    """Comparación de cobranza con lo observado EN ese día, no su estado de hoy."""
    directory = directory or ROOT / ".sync" / "transporte"
    latest = max(str(r[0])[:10] for r in live["rows"])
    current_rows = [r for r in live["rows"] if str(r[0]).startswith(latest)]
    companies = sorted({r[1] for r in live["rows"]})
    cut = min(str(r[8])[11:19] for r in current_rows)
    result = list(current_rows)
    for offset in (1, 7):
        day = (datetime.fromisoformat(latest) - timedelta(days=offset)).date().isoformat()
        for tenant in ("buses", "subte"):
            folder = directory / "capturas" / day
            names = sorted(p for p in folder.glob(f"*-{day}-{tenant}.json*") if p.name[:6] <= cut.replace(":", ""))
            snapshot = None
            if names:
                path = names[-1]
                opener = gzip.open if path.suffix == ".gz" else open
                with opener(path,"rt",encoding="utf8") as handle:
                    snapshot = json.load(handle)
                target = datetime.fromisoformat(day + "T" + cut)
                actual = datetime.fromisoformat(snapshot["checked"])
                if not 0 <= (target-actual).total_seconds() <= 600:
                    snapshot = None
            if snapshot:
                result.extend(snapshot["rows"])
            else:
                for company in companies:
                    if (company == "pms-emova-hml") == (tenant == "subte"):
                        result.append([day+"T00:00:00",company,"cobertura_fallida","cobertura_fallida",None,None,None,"",day+"T"+cut])
    return {**live, "id":"transporte_cobranza_capturas", "title":"Avance de cobranza observado en cada día", "rows":result,
            "description":"Capturas tomadas en cada día, hasta un corte horario común. Sin captura histórica, no hay comparación: el estado actual de un viaje de ayer no reconstruye lo que estaba cobrado ayer."}


if __name__ == "__main__":
    dataset, warnings = build_live()
    (ROOT / ".preview" / "transport-live.json").write_text(json.dumps(dataset), encoding="utf8")
    print(f"Alarmbot: {len(dataset['rows'])} filas agregadas; {len(warnings)} avisos.")
    for warning in warnings:
        print(warning)
