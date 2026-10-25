import importlib.util
from pathlib import Path
import json
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('inspection', Path(__file__).parents[1] / 'scripts/inspect-heroku-source.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class HerokuInspectionTests(unittest.TestCase):
    def test_default_does_not_request_config_or_treat_failed_latest_release_as_current(self):
        paths = []
        def get(path):
            paths.append(path)
            if path.endswith('/builds'):
                return 200, []
            if path.endswith('/releases'):
                return 200, [{'version': 100, 'status': 'failed'}, {'version': 99, 'status': 'succeeded'}]
            return 200, {'name': 'apianabet'}
        with patch.object(module, 'get', side_effect=get):
            report = module.inspect()
        self.assertFalse(report['current_release_verified'])
        self.assertEqual(report['latest_successful_release_in_response'], 99)
        self.assertNotIn('deployed_slug_commit', report)
        self.assertFalse(any(path.endswith('/config-vars') or '/slugs/' in path for path in paths))
    def test_current_release_is_used_instead_of_a_higher_failed_or_old_build(self):
        slug = '12345678-1234-1234-1234-123456789abc'
        def get(path):
            if path.endswith('/builds'):
                return 200, []
            if path.endswith('/releases'):
                return 200, [{'version': 100, 'status': 'failed'}, {'version': 99, 'status': 'succeeded', 'current': True, 'slug': {'id': slug}}]
            if '/slugs/' in path:
                return 200, {'commit': 'a' * 40}
            return 200, {'name': 'apianabet'}
        with patch.object(module, 'get', side_effect=get):
            report = module.inspect()
        self.assertTrue(report['current_release_verified'])
        self.assertEqual(report['current_release_version'], 99)
        self.assertEqual(report['deployed_slug_commit'], 'a' * 40)
    def test_optional_config_and_source_urls_never_disclose_credentials(self):
        def get(path):
            if path.endswith('/builds'):
                return 200, [{'created_at': '2026-10-24', 'status': 'succeeded', 'source_blob': {'version': 'a' * 40, 'url': 'https://fake-user:FAKE_PRIVATE_TOKEN@github.com/betticsweb/bettics_backend/archive/x?token=FAKE_PRIVATE_TOKEN'}}]
            if path.endswith('/releases'):
                return 401, None
            if path.endswith('/config-vars'):
                return 200, {'USR_NAME': 'FAKE_PRIVATE_NAME', 'PSS_WORD': 'FAKE_PRIVATE_PASSWORD', 'CLU': 'FAKE_PRIVATE_CLUSTER', 'BETTICS_ETL_TOKEN': 'FAKE_PRIVATE_TOKEN'}
            return 200, {'name': 'apianabet'}
        with patch.object(module, 'get', side_effect=get):
            report = module.inspect(include_config=True)
        self.assertNotIn('FAKE_PRIVATE', json.dumps(report))
        self.assertNotIn('fake-user', json.dumps(report))
        self.assertTrue(all(report['environment_presence'].values()))
        self.assertEqual(report['source_repository_hint'], 'betticsweb/bettics_backend')

if __name__ == '__main__':
    unittest.main()
