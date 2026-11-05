import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('probe', Path(__file__).parents[1] / 'scripts/probe-legacy-api.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

class LegacyProbeTests(unittest.TestCase):
    def test_only_fixed_readonly_paths_are_requested_and_guards_are_compared(self):
        calls = []
        def transport(url): calls.append(url); return 401
        before, after = module.capture(transport), module.capture(transport)
        self.assertTrue(module.compare(before, after)['legacy_guard_checks_unchanged'])
        self.assertEqual(len(calls), 8)
        self.assertTrue(all(url.startswith('https://apianabet.herokuapp.com/api/') and 'registrarMasivo' not in url for url in calls))
        self.assertFalse(before['credentials_sent']); self.assertEqual(before['post_requests'], 0)
    def test_error_or_missing_authentication_guard_is_not_treated_as_compatibility(self):
        before = module.capture(lambda url: 401)
        for value in (200, 404, 500, None):
            after = module.capture(lambda url: value)
            self.assertFalse(module.compare(before, after)['legacy_guard_checks_unchanged'])
        self.assertFalse(module.compare({}, before)['legacy_guard_checks_unchanged'])

if __name__ == '__main__': unittest.main()
