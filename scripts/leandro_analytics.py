"""Emisión desde eventos BHUB de Leandro. Sólo salen agregados, nunca payloads.

La identidad de una notificación no es la de la operación. Primero se deduplica
body.id; después se elige el último estado de data.id dentro de tenant/familia.
El catálogo de Leandro se reutiliza sin ejecutar su API ni su intérprete de montos.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
import importlib.util
import json
from pathlib import Path
import re


LOCAL = timezone(timedelta(hours=-3))  # almacen.guardar_evento usa hora local de esta máquina.


def obj(value):
    return value if isinstance(value, dict) else {}


def text(value, default="Sin dato"):
    return str(value).strip() if isinstance(value, (str, int)) and str(value).strip() else default


def timestamp(value):
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt.replace(tzinfo=LOCAL) if dt.tzinfo is None else dt
    except (TypeError, ValueError):
        return None


def cents(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        n = Decimal(str(value))
        return int((n * 100).quantize(Decimal("1"))) if n.is_finite() else None
    except (InvalidOperation, ValueError):
        return None


def load_catalog(path):
    spec = importlib.util.spec_from_file_location("leandro_catalogo", path)
    if not spec or not spec.loader:
        raise ValueError("No se pudo cargar el catálogo de Leandro")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.resolver


def state(data, kind):
    raw = text(data.get("state") or data.get("status"), "")
    known = {"approved": "Aprobada", "confirmed": "Aprobada", "confirmada": "Aprobada",
             "rejected": "Rechazada", "rechazada": "Rechazada", "pending": "Pendiente", "pendiente": "Pendiente"}
    if raw:
        return known.get(raw.lower(), raw)
    return known.get(kind.rsplit(".", 1)[-1].lower(), "Sin estado")


def normalize(record, resolve):
    event = obj(record.get("evento"))
    if "ping" in event:
        return None
    body = obj(event.get("body"))
    data = obj(body.get("data"))
    kind = text(body.get("type"), "")
    received = timestamp(record.get("recibido_en"))
    if not kind or not received:
        raise ValueError("Evento sin tipo o fecha de recepción válida")
    family = kind.rsplit(".", 1)[0].lower()
    info = resolve(kind.removeprefix("transactions."))
    holding = obj(obj(data.get("account")).get("holdingAccount"))
    detail = obj(data.get("stateDetail"))
    code = text(obj(detail.get("statusResponseCode")).get("code"), "Sin código")
    # Los mensajes de error libres pueden incluir datos personales. Sólo códigos.
    if not re.fullmatch(r"[\w .-]{1,48}", code):
        code = "Sin código"
    return {
        "tenant": text(record.get("tenant"), "sin_tenant"),
        "event_id": text(body.get("id"), ""),
        "entity_id": text(data.get("id"), ""),
        "family": family, "kind": kind,
        "fecha": received.astimezone(LOCAL).replace(minute=0, second=0, microsecond=0, tzinfo=None).isoformat(),
        "received": received, "occurred": timestamp(body.get("created")) or received,
        "fallback_time": timestamp(body.get("created")) is None,
        "distribuidor": text(holding.get("businessName") or holding.get("name"), "Sin distribuidor"),
        "categoria": info["categoria"], "tipo": kind.removeprefix("transactions."),
        "estado": state(data, kind), "moneda": text(obj(data.get("currency")).get("iso4217"), "Sin moneda"),
        "sentido": text(data.get("entryType")), "amount": cents(data.get("amount")),
        "codigo": code, "origen": text(detail.get("originRejectedType"), "Sin origen"),
        "tipo_tarjeta": text(data.get("cardType")),
        "adicional": "Sí" if data.get("isAdditional") is True else "No" if data.get("isAdditional") is False else "Sin dato",
    }


def metric(key, label, money=False, denominator=None):
    m = {"key": key, "label": label, "format": "money_cents" if money else "count"}
    if denominator:
        m.update(denominator=denominator, scale=100, format="percent")
    return m


def aggregate(records, dimensions, values):
    groups = defaultdict(list)
    for r in records:
        groups[tuple(r.get(k, "Sin dato") for k in ["fecha", *dimensions])].append(r)
    rows = []
    for key, group in sorted(groups.items()):
        totals = []
        for fn in values.values():
            numbers = [fn(r) for r in group]
            # Un monto desconocido hace parcial al grupo; no se presenta como cero.
            totals.append(None if any(n is None for n in numbers) else sum(numbers))
        rows.append([*key, *totals])
    return rows


def build_emision(root: Path, resolve, days=30, now=None):
    if not root.is_dir():
        raise ValueError(f"No existe el directorio de eventos: {root}")
    now = now or datetime.now(LOCAL)
    if now.tzinfo is None:
        now = now.replace(tzinfo=LOCAL)
    cutoff = (now.astimezone(LOCAL) - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    quality = Counter()
    unique = {}
    observed_dates = []
    for path in sorted(root.glob("*/*/*.json")):
        quality["archivos_leidos"] += 1
        try:
            record = json.loads(path.read_text(encoding="utf-8-sig"))
            if not isinstance(record, dict):
                raise ValueError("Sobre inválido")
            received = timestamp(record.get("recibido_en"))
            if received is None:
                raise ValueError("Sin fecha")
            if received > now:
                quality["fechas_futuras"] += 1
                continue
            if received < cutoff:
                quality["fuera_del_periodo"] += 1
                continue
            r = normalize(record, resolve)
            if r is None:
                quality["pings_excluidos"] += 1
                continue
            observed_dates.append(received)
            key = (r["tenant"], r["event_id"]) if r["event_id"] else ("archivo", str(path))
            if key in unique:
                quality["notificaciones_duplicadas"] += 1
                continue
            unique[key] = r
            quality["sin_id_evento"] += not bool(r["event_id"])
            quality["sin_id_entidad"] += not bool(r["entity_id"])
            quality["sin_tenant"] += r["tenant"] == "sin_tenant"
            quality["sin_fecha_origen"] += r["fallback_time"]
        except (OSError, ValueError, TypeError):
            quality["archivos_invalidos"] += 1

    events = list(unique.values())
    latest = {}
    histories = defaultdict(list)
    for r in events:
        if not r["entity_id"]:
            continue
        key = (r["tenant"], r["family"], r["entity_id"])
        histories[key].append(r)
        rank = (r["occurred"], r["received"], r["event_id"])
        if key not in latest or rank > latest[key][0]:
            latest[key] = (rank, r)
    entities = []
    for key, (_, row) in latest.items():
        entities.append({**row, "alta_observada": int(any(r["kind"].lower().endswith(".created") for r in histories[key]))})
    quality["eventos_unicos"] = len(events)
    quality["entidades_observadas"] = len(entities)
    quality["entidades_con_seguimiento"] = sum(len(v) > 1 for v in histories.values())

    datasets = []
    source = str(root / "<tenant>" / "<fecha>" / "<evento>.json")
    updated = max(observed_dates).isoformat() if observed_dates else now.isoformat()
    def add(id, title, description, records, dimensions, values, metrics):
        datasets.append({"id": id, "title": title, "description": description, "source": source,
                         "mode": "events" if id == "actividad" else "snapshot", "cadenceMinutes": 5,
                         "updatedAt": updated, "columns": ["fecha", *dimensions, *values],
                         "dimensions": dimensions, "metrics": metrics,
                         "rows": aggregate(records, dimensions, values)})

    common = ["tenant", "distribuidor", "tipo", "estado"]
    decisions = {"operaciones": lambda r: 1, "aprobadas": lambda r: int(r["estado"] == "Aprobada"),
                 "rechazadas": lambda r: int(r["estado"] == "Rechazada"),
                 "resueltas": lambda r: int(r["estado"] in {"Aprobada", "Rechazada"}),
                 "pendientes": lambda r: int(r["estado"] == "Pendiente")}
    decision_metrics = [metric("operaciones", "Operaciones observadas"), metric("aprobadas", "Aprobadas"),
                        metric("rechazadas", "Rechazadas"), metric("pendientes", "Pendientes observadas"),
                        metric("rechazadas", "Rechazo / resueltas filtradas", denominator="resueltas")]
    scope = ("Último estado observado por tenant, familia e ID de entidad, ordenado por la fecha del evento BHUB; "
             "recepción como respaldo. El gráfico agrupa por hora de recepción de ese último evento (Argentina). "
             "No es una serie de stock ni garantiza el estado actual en BHUB. ")
    transactions = [r for r in entities if r["family"].startswith("transactions.")]
    # ARS es la única moneda con formato monetario confirmado en Erick. Otras
    # monedas conservan conteos en su propia vista, sin rotularlas como pesos.
    for currency in sorted({r["moneda"] for r in transactions}):
        selected = [r for r in transactions if r["moneda"] == currency]
        values, metrics = dict(decisions), list(decision_metrics)
        if currency == "ARS":
            values.update(aprobado_cents=lambda r: r["amount"] if r["estado"] == "Aprobada" else 0,
                          rechazado_cents=lambda r: r["amount"] if r["estado"] == "Rechazada" else 0)
            metrics.extend([metric("aprobado_cents", "Importe aprobado ARS", True), metric("rechazado_cents", "Importe rechazado ARS", True)])
        add("operaciones_" + currency, f"Operaciones · {currency}", scope +
            "Importes brutos por tipo y sentido: no representan saldo, liquidación ni dinero neto; una transferencia interna puede generar dos movimientos. "
            "La tasa usa aprobadas + rechazadas del filtro; no incluye pendientes. Las monedas se separan.",
            selected, [*common, "sentido"], values, metrics)
    rejected = [r for r in transactions if r["estado"] == "Rechazada"]
    add("rechazos", "Rechazos · código y origen", scope + "Código y origen informados por BHUB; sin inferir causas a partir del texto libre.",
        rejected, ["tenant", "distribuidor", "tipo", "codigo", "origen", "moneda"],
        {"rechazos": lambda r: 1}, [metric("rechazos", "Operaciones rechazadas")])

    requests = [r for r in entities if r["family"] in {"cardaccount.cardholderaccountrequest", "cardaccount.additionalcardholderaccountrequest"}]
    add("solicitudes_tarjeta", "Solicitudes de tarjeta", scope + "Solicitudes de titular/adicional; aprobación de solicitud no equivale a tarjeta fabricada o entregada.",
        requests, [*common, "tipo_tarjeta"], decisions,
        [{**m, "label": "Solicitudes observadas"} if m["key"] == "operaciones" else m for m in decision_metrics])
    cards = [r for r in entities if r["family"] == "cardaccount.card"]
    add("tarjetas", "Tarjetas · último estado observado", scope + "Sólo tarjetas notificadas en el período; no es el parque total emitido. Normal, Delivered e InTransit son estados de origen.",
        cards, ["tenant", "estado", "tipo_tarjeta", "adicional"], {"tarjetas": lambda r: 1}, [metric("tarjetas", "Tarjetas observadas")])
    accounts = [r for r in entities if r["family"] == "account.account"]
    add("cuentas", "Cuentas · altas y estados", scope + "Las altas cuentan IDs con un evento Created observado en el período; no equivalen a cuentas activas totales.",
        accounts, ["tenant", "estado"], {"cuentas": lambda r: 1, "altas": lambda r: r["alta_observada"]},
        [metric("cuentas", "Cuentas observadas"), metric("altas", "Con alta observada")])
    loans = [r for r in entities if r["family"] == "lending.loanrequest"]
    add("prestamos", "Solicitudes de préstamo", scope + "Confirmada se normaliza a Aprobada. Los préstamos sin moneda declarada no se suman a ARS; aprobación tampoco acredita desembolso.",
        loans, common, decisions,
        [{**m, "label": "Solicitudes observadas"} if m["key"] == "operaciones" else m for m in decision_metrics])
    add("actividad", "Actividad · notificaciones recibidas", "Notificaciones únicas por ID de evento y tenant, excluyendo pings. Una entidad puede generar varias notificaciones. "
        "Agrupadas por recepción en hora argentina; esta vista mide actividad del webhook, no operaciones únicas ni importes.",
        events, [*common, "categoria"], {"eventos": lambda r: 1}, [metric("eventos", "Notificaciones únicas")])

    warnings = []
    if quality["sin_tenant"]:
        warnings.append(f"{quality['sin_tenant']} notificaciones sin tenant identificado. Distribuidor no reemplaza tenant.")
    for key, label in [("archivos_invalidos", "archivos inválidos excluidos"), ("notificaciones_duplicadas", "notificaciones repetidas excluidas"),
                       ("sin_id_entidad", "eventos sin ID de entidad: sólo se cuentan en actividad"), ("sin_id_evento", "eventos sin ID de notificación: no deduplicables"),
                       ("sin_fecha_origen", "eventos ordenados por recepción por falta de fecha de origen"), ("fechas_futuras", "eventos con recepción futura excluidos")]:
        if quality[key]:
            warnings.append(f"{quality[key]} {label}.")
    if loans and any(r["moneda"] == "Sin moneda" for r in loans):
        warnings.append("Hay préstamos sin moneda declarada: sus importes no se publican como ARS.")
    days_seen = {r["fecha"][:10] for r in events}
    notice = f"Cobertura: {len(days_seen)} día(s) con notificaciones. Son eventos recibidos, no un padrón completo de emisión."
    if quality["sin_tenant"]:
        notice += " Hay eventos sin tenant identificado."
    if not events:
        warnings.append("Sin eventos válidos dentro del período; no equivale a ausencia de operaciones.")
    return {"title": "Emisión · Leandro", "generado_en": now.isoformat(),
            "_procedencia": {"sistema": "Leandro · notificaciones BHUB recibidas vía n8n", "fuente": source,
                             "periodo_desde": cutoff.date().isoformat(), "ultima_recepcion": updated,
                             "dias_con_datos": len(days_seen), **dict(quality),
                             "alcance": "Agregados sin nombres de personas, cuentas, tarjetas, IDs de operaciones ni headers del webhook."},
            "_analytics": {"version": 1, "title": "EMISIÓN · BHUB", "notice": notice, "datasets": datasets, "warnings": warnings}}
