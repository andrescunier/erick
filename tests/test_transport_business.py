import sys
import unittest
import json
import tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from transport_business import public_rows, build_collection_history

class TransportTest(unittest.TestCase):
    def test_amount_already_in_cents_and_null_is_preserved(self):
        result={'executed_at':'2026-09-08T12:30:00','rows':[
            {'base':'A','hora':'2026-09-08T12:00:00','ativo':1,'estado':0,'taps':2,'monto_cents':175300,'sin_importe':0},
            {'base':'A','hora':'2026-09-08T12:00:00','ativo':2,'estado':255,'taps':1,'monto_cents':None,'sin_importe':1}]}
        rows=public_rows(result,'2026-09-08T12:30:00',['A','B'])
        self.assertEqual(rows[0][5],175300)
        self.assertIsNone(rows[1][5])
        self.assertEqual(len([r for r in rows if r[2]=='cobertura']),26)
        self.assertEqual(sum(r[4] for r in rows),3)
    def test_unknown_base_rejected(self):
        with self.assertRaises(ValueError):
            public_rows({'executed_at':'2026-09-08','rows':[{'base':'unexpected'}]},'2026-09-08T12:30:00',['A'])

    def test_previous_day_requires_a_capture_taken_that_day(self):
        live={'rows':[['2026-09-08T12:00:00','A','1','0',1,100,0,'2026-09-08T12:30:00','2026-09-08T12:30:00'],
                      ['2026-09-07T12:00:00','A','1','0',1,900,0,'2026-09-08T12:30:00','2026-09-07T12:30:00']]}
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            output=build_collection_history(live,root)
            self.assertNotIn(900,[r[5] for r in output['rows']])
            self.assertTrue(any(r[2]=='cobertura_fallida' for r in output['rows']))
            folder=root/'capturas'/'2026-09-07';folder.mkdir(parents=True)
            payload={'checked':'2026-09-07T12:28:00','rows':[
                ['2026-09-07T12:00:00','A','1','0',1,200,0,'2026-09-07T12:28:00','2026-09-07T12:28:00']]}
            (folder/'122800-2026-09-07-buses.json').write_text(json.dumps(payload),encoding='utf8')
            output=build_collection_history(live,root)
            self.assertIn(200,[r[5] for r in output['rows']])
