import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.error
import pandas as pd

spec = importlib.util.spec_from_file_location("backtest", Path(__file__).parents[1] / "knime/backtest_legacy_heroku.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
BASE = dict(match_id="7811554", fecha_partido="2025-07-01", liga="Finland Veikkausliiga", temporada="2025", mercado="CORNERS_OVER_85", periodo="FT", seleccion="OVER", linea=8.5, segmento="N1", cuota=1.25, version_politica="BETTICS_20261024_V1", tipo_evaluacion="OOT")

class KnimeTests(unittest.TestCase):
    def test_dry_run_224_forecasts_207_matches_never_reads_token_or_sends(self):
        records = [dict(BASE, match_id=str(8000000 + i % 207), **({"mercado": "GOLES_OVER_25", "linea": 2.5} if i >= 207 else {})) for i in range(224)]
        def forbidden(*args):
            self.fail("DRY_RUN must not access token or network")
        with patch.object(module.os.environ, "get", side_effect=forbidden):
            result = module.run_backtest(pd.DataFrame(records), post=forbidden)
        self.assertEqual(result[0]["registros_validados"], 224)
        self.assertEqual(result[0]["partidos_unicos_lote"], 207)
        self.assertEqual(result[0]["enviados"], 0)
        self.assertTrue(module.DRY_RUN)
    def test_home_nan_line_is_json_null_and_keeps_home(self):
        row = dict(BASE, mercado="CORNERS_LOCAL_GANA", seleccion="HOME", linea=float("nan"))
        records = module.prepare_records(pd.DataFrame([row]))
        self.assertIsNone(records[0]["linea"])
        self.assertEqual(records[0]["seleccion"], "HOME")
        self.assertNotIn("NaN", json.dumps(records, allow_nan=False))
    def test_rejects_bad_segments_odds_unapproved_extra_columns_and_conflicts(self):
        for row in [dict(BASE, cuota=0), dict(BASE, periodo="1H"), dict(BASE, cuota=True), dict(BASE, mercado="GOLES_OVER_25", linea=2.5, segmento="N4"), dict(BASE, fecha_partido="2025-02-30")]:
            with self.assertRaises(ValueError):
                module.prepare_records(pd.DataFrame([row]))
        with self.assertRaises(ValueError):
            module.prepare_records(pd.DataFrame([dict(BASE, goles=0)]))
        with self.assertRaises(ValueError):
            module.prepare_records(pd.DataFrame([BASE, dict(BASE, cuota=2)]))
    def test_batches_250_and_verifies_server_counts_with_simulated_transport(self):
        calls = []
        def sender(body, token):
            count = len(body["registros"])
            calls.append(count)
            return 200, {"estado": "ok", "resumen": dict(recibidos=count, insertados=count, actualizados=0, sin_cambios=0, rechazados=0, pendientes=0, indeterminados=0)}
        with patch.dict(os.environ, {"BETTICS_ETL_TOKEN": "unit-test-only"}):
            result = module.run_backtest(pd.DataFrame([dict(BASE, match_id=str(9000000+i)) for i in range(501)]), dry_run=False, post=sender)
        self.assertEqual(calls, [250, 250, 1])
        self.assertEqual(sum(row["enviados"] for row in result), 501)
    def test_partial_or_invalid_acknowledgement_is_not_reported_as_success(self):
        with patch.dict(os.environ, {"BETTICS_ETL_TOKEN": "unit-test-only"}):
            for status, body in [(207, {}), (200, {"estado": "ok", "resumen": {}})]:
                with self.assertRaises(ValueError):
                    module.run_backtest(pd.DataFrame([BASE]), dry_run=False, post=lambda *args: (status, body))
    def test_retry_is_bounded_and_authentication_failures_are_not_retried(self):
        attempts = []
        def unavailable(*args):
            attempts.append(1)
            raise urllib.error.HTTPError(module.API_URL, 503, "Unavailable", {}, None)
        with patch.dict(os.environ, {"BETTICS_ETL_TOKEN": "unit-test-only"}):
            with self.assertRaises(RuntimeError):
                module.run_backtest(pd.DataFrame([BASE]), dry_run=False, post=unavailable, sleep=lambda n: None)
            self.assertEqual(len(attempts), 3)
            attempts.clear()
            def denied(*args):
                attempts.append(1)
                raise urllib.error.HTTPError(module.API_URL, 401, "Denied", {}, None)
            with self.assertRaises(RuntimeError):
                module.run_backtest(pd.DataFrame([BASE]), dry_run=False, post=denied, sleep=lambda n: None)
            self.assertEqual(len(attempts), 1)
    def test_disabled_server_gate_stops_before_sending_later_batches(self):
        calls = []
        def blocked(body, token):
            calls.append(len(body['registros']))
            return 423, {'estado': 'bloqueado', 'codigo': 'CARGA_DESHABILITADA', 'escrituras': False}
        records = [dict(BASE, match_id=str(9100000+i)) for i in range(501)]
        with patch.dict(os.environ, {'BETTICS_ETL_TOKEN': 'unit-test-only'}):
            with self.assertRaises(ValueError):
                module.run_backtest(pd.DataFrame(records), dry_run=False, post=blocked)
        self.assertEqual(calls, [250])
    def test_live_mode_requires_explicit_boolean_and_token(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ValueError):
                module.run_backtest(pd.DataFrame([BASE]), dry_run=False)
        with self.assertRaises(ValueError):
            module.run_backtest(pd.DataFrame([BASE]), dry_run="False")
    def test_does_not_follow_redirects_or_target_render(self):
        self.assertEqual(module.API_URL, "https://apianabet.herokuapp.com/api/backtest/registrarMasivo")
        self.assertIsNone(module._NoRedirect().redirect_request(None, None, 302, "redirect", {}, "https://example.com"))

if __name__ == "__main__":
    unittest.main()

class ExtendedPolicyTests(unittest.TestCase):
    def test_additional_market_requires_explicit_versioned_policy(self):
        row = dict(BASE, mercado="AMBOS_MARCAN_SI", seleccion="YES", linea=None)
        with self.assertRaises(ValueError):
            module.prepare_records(pd.DataFrame([row]))
        policy = dict(mercado=row["mercado"], version_politica=row["version_politica"], family="BTTS", seleccion="YES", linea=None, segmentos=["N1"], verified=True, evidence="TEST FIXTURE ONLY")
        self.assertEqual(module.prepare_records(pd.DataFrame([row]), {"markets":[policy]})[0]["seleccion"], "YES")
        with self.assertRaises(ValueError):
            module.prepare_records(pd.DataFrame([dict(row, segmento="N4")]), {"markets":[policy]})
        with self.assertRaises(ValueError):
            module.prepare_records(pd.DataFrame([row]), {"markets":[policy,policy]})
