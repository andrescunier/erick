"""Baseline de viajes: consultas históricas de Alarmbot con ventanas completas y homogéneas."""
from datetime import datetime, timedelta
from pathlib import Path
import json
import os
from transport_business import ROOT, fetch_query


def hourly_rows(result, date, companies):
    counts = {(company, hour): 0 for company in companies for hour in range(24)}
    for row in result["rows"]:
        stamp = datetime.fromisoformat(row["hora"])
        if stamp.date().isoformat() != date or row["base"] not in companies:
            raise ValueError("Respuesta fuera de la ventana o empresa solicitada")
        if str(row["estado"]) in ("0", "255"):
            counts[row["base"], stamp.hour] += int(row["taps"])
    return [[f"{date}T{hour:02d}:00:00", company, count, result["executed_at"]]
            for (company, hour), count in sorted(counts.items())]


def build_baseline(now=None, directory=None, fetch=fetch_query, max_queries=4, prefetch=True):
    now = now or datetime.now()
    directory = directory or ROOT / ".sync" / "baseline-viajes"
    directory.mkdir(parents=True, exist_ok=True)
    alarm = Path(os.environ.get("ERICK_ALARMBOT_PROJECT", r"C:\andybot\alarmbot"))
    bases = json.loads((alarm / "SQL/_bases_buses.json").read_text(encoding="utf8"))["bases"]
    rows, warnings, used = [], [], 0
    # Sólo mismo día de semana; hoy nunca forma parte de su propia referencia.
    for week in range(1, 9):
        day = now.date() - timedelta(days=7*week)
        date, end = day.isoformat(), (day+timedelta(days=1)).isoformat()
        for tenant, query, companies in (("buses", "Erick_Transporte_Horario_Buses", bases),
                                         ("subte", "Erick_Transporte_Horario", ["pms-emova-hml"])):
            path = directory / f"{date}-{tenant}.json"
            if not path.exists() and used < max_queries:
                used += 1
                try:
                    result = fetch(tenant, query, date+"T00:00:00", end+"T00:00:00")
                    payload = {"version":1,"date":date,"query":query,"from":date+"T00:00:00","to":end+"T00:00:00",
                               "rows":hourly_rows(result,date,companies)}
                    temp = path.with_suffix(".tmp")
                    temp.write_text(json.dumps(payload,separators=(",",":")),encoding="utf8")
                    temp.replace(path)
                except Exception:
                    warnings.append(f"Referencia de viajes: no se pudo recuperar {tenant} del {date}; no se reemplaza por cero.")
            if path.exists():
                payload = json.loads(path.read_text(encoding="utf8"))
                if payload.get("version") == 1 and payload.get("date") == date:
                    rows.extend(payload["rows"])
    # Cuando hoy ya está preparado, adelantar mañana con el mismo presupuesto.
    if prefetch and used == 0 and max_queries > 0:
        build_baseline(now+timedelta(days=1), directory, fetch, max_queries, prefetch=False)
    return {"id":"viajes_baseline_historico","title":"Histórico horario para referencia de viajes","mode":"history",
            "source":"Alarmbot · ventanas completas de 24 horas · sam_dt · estados 0/255",
            "updatedAt":now.astimezone().isoformat(),
            "description":"Ocho días equivalentes de las últimas ocho semanas. Una observación por empresa, fecha y hora. Las horas sin viajes son cero sólo cuando la consulta completa fue exitosa. No se suman exportaciones superpuestas. Los CSV de recepción de última hora y pendientes de 48 horas no se mezclan con este universo.",
            "columns":["fecha","empresa","viajes","consultado_en"],"dimensions":["empresa"],
            "metrics":[{"key":"viajes","label":"Viajes","format":"count"}],"rows":rows}, warnings


if __name__ == "__main__":
    dataset, warnings = build_baseline(max_queries=16)
    print(f"Referencia: {len(dataset['rows'])} horas/empresa; {len({r[0][:10] for r in dataset['rows']})} fechas históricas.")
    for warning in warnings:
        print(warning)
