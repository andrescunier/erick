import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from trip_baseline import hourly_rows

class BaselineTest(unittest.TestCase):
    def test_full_coverage_and_states(self):
        result={'executed_at':'2026-09-09T07:00:00','rows':[
            {'hora':'2026-09-02T07:00:00','base':'A','estado':0,'ativo':0,'taps':4},
            {'hora':'2026-09-02T07:00:00','base':'A','estado':255,'ativo':1,'taps':3},
            {'hora':'2026-09-02T07:00:00','base':'A','estado':8,'ativo':1,'taps':100}]}
        rows=hourly_rows(result,'2026-09-02',['A','B'])
        self.assertEqual(len(rows),48)
        self.assertEqual(sum(r[2] for r in rows),7)
        self.assertEqual(next(r[2] for r in rows if r[0].endswith('07:00:00') and r[1]=='A'),7)
    def test_unexpected_window_not_cached(self):
        with self.assertRaises(ValueError):
            hourly_rows({'rows':[{'hora':'2026-09-01T23:00:00','base':'A'}]},'2026-09-02',['A'])
