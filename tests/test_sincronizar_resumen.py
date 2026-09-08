import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("sync", Path(__file__).parents[1] / "scripts/sincronizar_resumen.py")
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)

class SyncTests(unittest.TestCase):
    def test_missing_and_zero(self):
        self.assertIsNone(sync._derivados({})["no_cobrado_cents"])
        self.assertEqual(sync._derivados({"by_presentation_state": {"PAID": {"monto_cents": 100}}})["no_cobrado_cents"], 0)
        self.assertEqual(sync._derivados({"by_presentation_state": {"PAID": {"monto_cents": 300}, "UNPAID": {"monto_cents": 100}}})["no_cobrado_pct"], 25)

    def test_windows(self):
        result = sync._normalizar_ventanas({"7d": {"money_previous_cents": 0, "money_variation_pct": 0}, "1d": {"money_previous_cents": 100, "money_variation_pct": 0}})
        self.assertIsNone(result["7d"]["money_variation_pct"])
        self.assertEqual(result["1d"]["money_variation_pct"], 0)

    def test_latest_business_date_wins(self):
        with tempfile.TemporaryDirectory() as root:
            for date, run in [("2026-09-01", "20260908120000"), ("2026-09-07", "20260908010000")]:
                path = Path(root) / date / run / "structured/business_summary.json"
                path.parent.mkdir(parents=True)
                path.write_text(json.dumps({"process_date": date}))
            self.assertEqual(sync._ultimo_resumen(Path(root))["process_date"], "2026-09-07")

if __name__ == "__main__":
    unittest.main()
