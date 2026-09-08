from datetime import datetime
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("leandro_analytics", Path(__file__).parents[1] / "scripts/leandro_analytics.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def resolver(kind):
    return {"nombre": kind, "categoria": "transferencia" if kind.startswith("Bank") else "otro"}


def event(event_id, entity_id="operation-secret", kind="transactions.BankOutputTransfer.Confirmed", state="approved",
          tenant="one", hour=12, source_hour=None, currency="ARS", amount=123.45):
    return {"recibido_en": f"2026-09-08T{hour:02}:00:00", "tenant": tenant, "evento": {
        "headers": {"Authorization": "private-token"}, "body": {"id": event_id, "type": kind,
        "created": f"2026-09-08T{(source_hour if source_hour is not None else hour):02}:00:00-03:00",
        "data": {"id": entity_id, "state": state, "amount": amount, "currency": {"iso4217": currency} if currency else None,
                 "user": {"userName": "Private Person"}, "account": {"accountNumber": "private-account"},
                 "stateDetail": {"message": "Private Person private-account", "statusResponseCode": {"code": 402}}}}}}


def build(records):
    with tempfile.TemporaryDirectory() as root:
        p = Path(root) / "one" / "2026-09-08"
        p.mkdir(parents=True)
        for i, r in enumerate(records):
            (p / f"{i:04}.json").write_text(json.dumps(r), encoding="utf-8")
        return mod.build_emision(Path(root), resolver, now=datetime(2026, 9, 8, 20, tzinfo=mod.LOCAL))


def dataset(result, id):
    return next(d for d in result["_analytics"]["datasets"] if d["id"] == id)


def total(result, id, column):
    d = dataset(result, id)
    return sum(r[d["columns"].index(column)] or 0 for r in d["rows"])


class LeandroTests(unittest.TestCase):
    def test_retry_and_lifecycle_are_not_extra_operations(self):
        pending = event("notification-1", kind="transactions.BankOutputTransfer.Pending", state="pending")
        rejected = event("notification-2", kind="transactions.BankOutputTransfer.Rejected", state="rejected", hour=13)
        result = build([pending, pending, rejected])
        self.assertEqual(total(result, "actividad", "eventos"), 2)
        self.assertEqual(total(result, "operaciones_ARS", "operaciones"), 1)
        self.assertEqual(total(result, "operaciones_ARS", "pendientes"), 0)
        self.assertEqual(total(result, "operaciones_ARS", "rechazado_cents"), 12345)
        self.assertEqual(result["_procedencia"]["notificaciones_duplicadas"], 1)

    def test_out_of_order_delivery_uses_source_time(self):
        rejected = event("n1", kind="transactions.BankOutputTransfer.Rejected", state="rejected", hour=14, source_hour=14)
        delayed = event("n2", kind="transactions.BankOutputTransfer.Pending", state="pending", hour=15, source_hour=12)
        result = build([rejected, delayed])
        self.assertEqual(total(result, "operaciones_ARS", "rechazadas"), 1)

    def test_identity_scoped_by_tenant_and_family(self):
        result = build([event("a"), event("b", tenant="two"), event("c", kind="transactions.BankInputTransfer.Confirmed")])
        self.assertEqual(total(result, "operaciones_ARS", "operaciones"), 3)

    def test_missing_identity_only_in_activity(self):
        r = event("n1")
        del r["evento"]["body"]["data"]["id"]
        result = build([r])
        self.assertEqual(total(result, "actividad", "eventos"), 1)
        self.assertFalse(any(d["id"].startswith("operaciones_") for d in result["_analytics"]["datasets"]))
        self.assertEqual(result["_procedencia"]["sin_id_entidad"], 1)

    def test_currency_is_never_assumed(self):
        result = build([event("ars"), event("usd", entity_id="usd", currency="USD"),
                        event("loan", kind="lending.loanRequest.Confirmed", state="Confirmada", currency=None)])
        self.assertEqual(total(result, "operaciones_ARS", "aprobado_cents"), 12345)
        self.assertFalse(any(c.endswith("_cents") for c in dataset(result, "operaciones_USD")["columns"]))
        self.assertEqual(total(result, "prestamos", "aprobadas"), 1)
        self.assertFalse(any(c.endswith("_cents") for c in dataset(result, "prestamos")["columns"]))

    def test_card_changes_are_one_observed_card(self):
        result = build([event("c1", kind="cardAccount.Card.Change-State", state="InTransit"),
                        event("c2", kind="cardAccount.Card.Change-State", state="Delivered", hour=13)])
        self.assertEqual(total(result, "tarjetas", "tarjetas"), 1)
        self.assertIn("Delivered", dataset(result, "tarjetas")["rows"][0])

    def test_account_created_and_changed_are_one_account(self):
        first = event("c1", kind="account.Account.Created", state=None)
        first["evento"]["body"]["data"]["status"] = "Open"
        second = event("c2", kind="account.Account.Change-State", state=None, hour=13)
        second["evento"]["body"]["data"]["status"] = "Preventive Suspension"
        result = build([first, second])
        self.assertEqual(total(result, "cuentas", "cuentas"), 1)
        self.assertEqual(total(result, "cuentas", "altas"), 1)

    def test_aggregates_never_publish_private_fields(self):
        result = json.dumps(build([event("private-notification")] ))
        for secret in ["Private Person", "private-account", "private-token", "operation-secret", "private-notification", "Authorization", "userName"]:
            self.assertNotIn(secret, result)

    def test_missing_amount_is_not_zero(self):
        result = build([event("n1", amount=None)])
        d = dataset(result, "operaciones_ARS")
        self.assertIsNone(d["rows"][0][d["columns"].index("aprobado_cents")])

    def test_ping_bad_record_and_unknown_tenant(self):
        result = build([{"recibido_en": "2026-09-08T12:00:00", "evento": {"ping": True}},
                        {"recibido_en": "bad"}, event("n1", tenant="sin_tenant")])
        self.assertEqual(result["_procedencia"]["pings_excluidos"], 1)
        self.assertEqual(result["_procedencia"]["archivos_invalidos"], 1)
        self.assertEqual(total(result, "actividad", "eventos"), 1)
        self.assertIn("sin tenant", result["_analytics"]["notice"])


if __name__ == "__main__":
    unittest.main()
