import csv
from datetime import date
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("analytics", Path(__file__).parents[1] / "scripts/analytics_csv.py")
analytics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analytics)


class AnalyticsTests(unittest.TestCase):
    def test_money(self):
        self.assertEqual(analytics.number("123.45", True), 12345)
        self.assertEqual(analytics.number("0", True), 0)
        self.assertIsNone(analytics.number("", True))
        self.assertIsNone(analytics.number("NaN", True))

    def test_reprocessing_replaces_whole_day(self):
        with tempfile.TemporaryDirectory() as root:
            p = Path(root) / "detalle_estados.csv"
            with p.open("w", newline="", encoding="utf-8") as handle:
                w = csv.writer(handle, delimiter=";")
                w.writerow(["fecha", "tenant", "tipo_estado", "estado", "cantidad", "monto", "process_ts"])
                w.writerow(["20260901", "A", "PRESENTACION", "UNPAID", 1, "10.10", "2026-09-02"])
                w.writerow(["20260901", "A", "PRESENTACION", "PAID", 1, "20.20", "2026-09-03"])
                w.writerow(["20260901", "A", "PRESENTACION", "UNPAID", 1, "10.10", "2026-09-02"])
            result = analytics.read_bi(Path(root), analytics.SPECS[1], "2026-09-01")
            self.assertEqual(len(result["rows"]), 1)
            self.assertEqual(result["rows"][0][-1], 2020)

    def test_latest_alarm_snapshot_not_sum_of_exports(self):
        with tempfile.TemporaryDirectory() as root:
            for time, count in [("100000", 10), ("110000", 15)]:
                (Path(root) / f"20260908_{time}_buses_main_control_ativo_48hs_buses.csv").write_text(
                    f"Base,ativo,hora,cantidad\nexample,2,2026-09-08T09:00:00,{count}\n")
            result = analytics.read_alarm(Path(root), True)
            self.assertEqual(len(result["rows"]), 1)
            self.assertEqual(result["rows"][0][-1], 15)

    def test_missing_sources_are_explicit(self):
        with tempfile.TemporaryDirectory() as root:
            result = analytics.build_analytics(Path(root), Path(root), today=date(2026, 9, 8))
            self.assertEqual(result["datasets"], [])
            self.assertEqual(len(result["warnings"]), len(analytics.SPECS) + 2)


if __name__ == "__main__":
    unittest.main()
