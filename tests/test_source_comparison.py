import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("comparison", Path(__file__).parents[1] / "scripts/compare-deployed-source.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SourceComparisonTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.repo, self.snapshot = self.root / "repo", self.root / "snapshot"
        self.repo.mkdir(); self.snapshot.mkdir()
        subprocess.run(["git", "init", "-q", str(self.repo)], check=True)
        for path in (self.repo, self.snapshot):
            (path / "app").mkdir()
            (path / "package.json").write_text('{"name":"test-backend"}')
            (path / "server.js").write_text('require("./app/api");')
            (path / "app/api.js").write_text('module.exports = {};')
        subprocess.run(["git", "-C", str(self.repo), "add", "."], check=True)
        subprocess.run(["git", "-C", str(self.repo), "-c", "user.name=Local test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"], check=True)
        self.sha = subprocess.check_output(["git", "-C", str(self.repo), "rev-parse", "HEAD"]).decode().strip()
    def tearDown(self):
        self.temp.cleanup()
    def test_matching_source_and_release_sha_do_not_claim_snapshot_provenance(self):
        report = module.compare(self.repo, self.snapshot, self.sha, self.sha)
        self.assertTrue(report["scoped_files_identical"])
        self.assertTrue(report["release_commit_matches_reference"])
        self.assertFalse(report["snapshot_provenance_verified_by_script"])
    def test_changes_missing_and_extra_runtime_files_are_detected(self):
        (self.snapshot / "server.js").write_text('different')
        (self.snapshot / "app/api.js").unlink()
        (self.snapshot / "app/extra.js").write_text('extra')
        report = module.compare(self.repo, self.snapshot, self.sha)
        self.assertEqual(report["changed"], ["server.js"])
        self.assertEqual(report["missing"], ["app/api.js"])
        self.assertEqual(report["extra"], ["app/extra.js"])
        self.assertFalse(report["scoped_files_identical"])
    def test_secrets_dependencies_and_symlinks_are_not_read(self):
        (self.snapshot / ".env").write_text('FAKE_TEST_SECRET=not-to-be-read')
        (self.snapshot / "app/.env").write_text('FAKE_TEST_SECRET=not-to-be-read')
        (self.snapshot / "app/.private").mkdir()
        (self.snapshot / "app/.private/key.json").write_text('not-to-be-read')
        (self.snapshot / "node_modules").mkdir()
        (self.snapshot / "node_modules/secret.js").write_text('not-to-be-read')
        report = module.compare(self.repo, self.snapshot, self.sha)
        self.assertTrue(report["scoped_files_identical"])
        (self.snapshot / "app/link.js").symlink_to(self.snapshot / ".env")
        report = module.compare(self.repo, self.snapshot, self.sha)
        self.assertFalse(report["comparison_complete"])
        self.assertEqual(report["unsafe_or_unreadable"], ["app/link.js"])
        self.assertNotIn('not-to-be-read', json.dumps(report))
    def test_deployed_snapshot_with_no_package_is_incomplete(self):
        (self.snapshot / "package.json").unlink()
        self.assertFalse(module.compare(self.repo, self.snapshot, self.sha)["comparison_complete"])
    def test_release_and_reference_mismatch_remain_explicit(self):
        report = module.compare(self.repo, self.snapshot, self.sha, 'a' * 40)
        self.assertTrue(report["scoped_files_identical"])
        self.assertFalse(report["release_commit_matches_reference"])
        with self.assertRaises(ValueError):
            module.compare(self.repo, self.snapshot, self.sha, 'master')

if __name__ == "__main__":
    unittest.main()
