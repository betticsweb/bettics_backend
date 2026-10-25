import importlib.util
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location('release_tool', ROOT / 'scripts/prepare-backtest-release.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo)] + list(args))

def commit(repo):
    git(repo, 'add', '.')
    git(repo, '-c', 'user.name=Local test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture')
    return git(repo, 'rev-parse', 'HEAD').decode().strip()

class ReleasePreparationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        self.target, self.candidate = self.root/'target', self.root/'candidate'
        for path in (self.target, self.candidate):
            path.mkdir(); git(path, 'init', '-q')
        (self.target/'app/config').mkdir(parents=True)
        (self.target/'app/controllers').mkdir()
        (self.target/'app/controllers/existing.js').write_text('module.exports = "existing endpoint";')
        (self.target/'server.js').write_text("const errorMiddleware = require('./app/middleware/errors')\nfunction routes() {\n        this.app.use(loginRouters, errorMiddleware)\n}\n")
        (self.target/'app/config/constantes.js').write_text('module.exports = {\n    SchemaName: {\n        existing: "existing"\n    }\n}\n')
        (self.target/'package.json').write_text('{"dependencies":{"mongoose":"^6.0.9","express":"^4.17.1"}}')
        (self.target/'package-lock.json').write_text('{"original":"lock"}')
        self.base = commit(self.target)
        for name in module.RUNTIME + module.SUPPORT:
            dest = self.candidate/name; dest.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(ROOT/name, dest)
        self.source = commit(self.candidate)
    def tearDown(self):
        self.temp.cleanup()
    def test_additive_patch_preserves_all_previous_code_and_dependencies(self):
        report = module.prepare(self.target, self.base, self.candidate, self.source)
        self.assertEqual(report['legacy_content_changes'], [])
        self.assertEqual((self.target/'package-lock.json').read_text(), '{"original":"lock"}')
        self.assertEqual((self.target/'app/controllers/existing.js').read_text(), 'module.exports = "existing endpoint";')
        self.assertEqual(git(self.target, 'rev-parse', 'HEAD').decode().strip(), self.base)
        self.assertFalse(report['mongodb_operations'])
    def test_unrecognized_server_anchor_is_not_rewritten(self):
        (self.target/'server.js').write_text('different existing architecture')
        self.base = commit(self.target)
        with self.assertRaises(ValueError): module.prepare(self.target, self.base, self.candidate, self.source)
        self.assertFalse((self.target/module.RUNTIME[0]).exists())
    def test_dirty_target_or_incompatible_dependencies_stop_before_writing(self):
        (self.target/'package.json').write_text('{"dependencies":{"mongoose":"^5.0.0","express":"^4.17.1"}}')
        with self.assertRaises(ValueError): module.prepare(self.target, self.base, self.candidate, self.source)
        self.base = commit(self.target)
        with self.assertRaises(ValueError): module.prepare(self.target, self.base, self.candidate, self.source)
        self.assertFalse((self.target/module.RUNTIME[0]).exists())
    def test_build_hook_or_release_phase_is_not_approved_implicitly(self):
        (self.target/'package.json').write_text('{"dependencies":{"mongoose":"^6.0.9","express":"^4.17.1"},"scripts":{"postinstall":"node database-task.js"}}')
        self.base = commit(self.target)
        with self.assertRaises(ValueError): module.prepare(self.target, self.base, self.candidate, self.source)
        self.assertFalse((self.target/module.RUNTIME[0]).exists())
    def test_existing_backtest_namespace_is_not_overwritten(self):
        (self.target/'app/routes').mkdir()
        (self.target/'app/routes/existing.js').write_text('router.get("/api/backtest/existing", handler);')
        self.base = commit(self.target)
        with self.assertRaises(ValueError): module.prepare(self.target, self.base, self.candidate, self.source)
        self.assertFalse((self.target/module.RUNTIME[0]).exists())
    def test_verification_detects_subsequent_changes_to_legacy_code(self):
        module.prepare(self.target, self.base, self.candidate, self.source)
        (self.target/'app/controllers/existing.js').write_text('changed old API')
        with self.assertRaises(ValueError): module.verify(self.target, self.base, self.candidate, self.source)
    def test_verification_detects_subsequent_changes_to_new_module(self):
        module.prepare(self.target, self.base, self.candidate, self.source)
        (self.target/module.RUNTIME[0]).write_text('changed candidate')
        with self.assertRaises(ValueError): module.verify(self.target, self.base, self.candidate, self.source)

if __name__ == '__main__': unittest.main()
