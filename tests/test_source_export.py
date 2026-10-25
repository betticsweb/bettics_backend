import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('exporter', Path(__file__).parents[1] / 'scripts/export-heroku-source.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SourceExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'; self.repo.mkdir(); (self.repo / 'app').mkdir()
        subprocess.run(['git', 'init', '-q', str(self.repo)], check=True)
        (self.repo / 'package.json').write_text('{"name":"synthetic-backend"}')
        (self.repo / 'server.js').write_text('require("./app/api")')
        (self.repo / 'app/api.js').write_text('module.exports = {}')
        self.output = self.root / 'snapshot.zip'
    def tearDown(self):
        self.temp.cleanup()
    def commit(self):
        subprocess.run(['git', '-C', str(self.repo), 'add', '.'], check=True)
        subprocess.run(['git', '-C', str(self.repo), '-c', 'user.name=Local test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture'], check=True)
        return subprocess.check_output(['git', '-C', str(self.repo), 'rev-parse', 'HEAD']).decode().strip()
    def test_exports_exact_commit_not_dirty_tree_and_excludes_secret_paths_history_dependencies(self):
        for name in ['.env', 'app/.env', 'app/credentials.json', 'app/private-key.json']:
            (self.repo / name).write_text('SYNTHETIC_PRIVATE_VALUE')
        (self.repo / 'node_modules').mkdir(); (self.repo / 'node_modules/test.js').write_text('SYNTHETIC_PRIVATE_VALUE')
        sha = self.commit()
        (self.repo / 'server.js').write_text('dirty uncommitted source')
        module.export(self.repo, sha, self.output)
        with zipfile.ZipFile(self.output) as archive:
            names = archive.namelist()
            self.assertEqual(archive.read('server.js'), b'require("./app/api")')
            self.assertFalse(any('.git/' in n or '.env' in n or 'credentials' in n or 'node_modules' in n for n in names))
            self.assertNotIn(b'SYNTHETIC_PRIVATE_VALUE', b''.join(archive.read(n) for n in names))
            self.assertEqual(json.loads(archive.read('snapshot-manifest.json'))['source_commit'], sha)
    def test_detected_hardcoded_secret_stops_before_creating_zip_and_is_not_echoed(self):
        (self.repo / 'app/api.js').write_text('const password = "SYNTHETIC_PRIVATE_VALUE";')
        sha = self.commit()
        with self.assertRaises(module.ExportBlocked) as error:
            module.export(self.repo, sha, self.output)
        self.assertFalse(self.output.exists())
        self.assertIn('app/api.js', str(error.exception))
        self.assertNotIn('SYNTHETIC_PRIVATE_VALUE', str(error.exception))
    def test_separate_redacted_copy_is_marked_and_does_not_change_repository(self):
        original = 'const password = "SYNTHETIC_PRIVATE_VALUE";'
        (self.repo / 'app/api.js').write_text(original); sha = self.commit()
        sanitized = self.root / 'redacted'; (sanitized / 'app').mkdir(parents=True)
        (sanitized / 'app/api.js').write_text('const password = "REDACTED_FOR_SHARING";')
        module.export(self.repo, sha, self.output, sanitized)
        self.assertEqual((self.repo / 'app/api.js').read_text(), original)
        with zipfile.ZipFile(self.output) as archive:
            report = json.loads(archive.read('snapshot-manifest.json'))
            self.assertEqual(report['redacted_or_replaced_files'], ['app/api.js'])
            self.assertNotIn(b'SYNTHETIC_PRIVATE_VALUE', archive.read('app/api.js'))
    def test_scanner_accepts_environment_references_and_flags_uri_private_keys_and_bare_assignments(self):
        self.assertFalse(module.suspected_secret(b'const uri = `mongodb+srv://${process.env.USER}:${process.env.PASSWORD}@cluster/db`;'))
        for text in ['mongodb://actual_user:actual_password@host/db', '-----BEGIN RSA PRIVATE KEY-----', 'KEY_JWT=actual-secret node server.js', 'client.setApiKey("actual-secret")']:
            self.assertTrue(module.suspected_secret(text.encode()), text)
    def test_refuses_output_overwrite_and_non_sha_identifiers(self):
        sha = self.commit()
        with self.assertRaises(module.ExportBlocked):
            module.export(self.repo, 'master', self.output)
        self.output.write_text('keep')
        with self.assertRaises(module.ExportBlocked):
            module.export(self.repo, sha, self.output)
        self.assertEqual(self.output.read_text(), 'keep')

if __name__ == '__main__':
    unittest.main()
