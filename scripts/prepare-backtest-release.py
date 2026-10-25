"""Prepare/verify an additive backtest patch locally. No network, deploy or DB.
Run from a tool checkout; the target remains based on its own Heroku commit.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess

RUNTIME = (
    'app/models/backtestAprobados.js', 'app/controllers/backtest.js', 'app/routes/backtest.js',
    'app/middleware/backtest-etl-auth.js', 'app/middleware/backtest-write-gate.js',
    'app/services/backtest/contract.js', 'app/services/backtest/ingest.js', 'app/services/backtest/store.js'
)
SUPPORT = (
    'tests/backtest-api.test.js', 'tests/backtest-contract.test.js', 'tests/backtest-safety.test.js',
    'tests/helpers/backtest-fixture.js', 'tests/test_knime_backtest.py',
    'knime/backtest_legacy_heroku.py', 'scripts/audit-backtest-environment.js'
)
SERVER_LINES = (
    "const backtestRouters = require('./app/routes/backtest')\n",
    "        this.app.use('/api/backtest', backtestRouters.bodyError)\n",
    "        this.app.use(backtestRouters)\n"
)
CONSTANT_LINE = '        backtestAprobados: "backtestAprobados",\n'


def git(repo, *args):
    return subprocess.run(['git', '-C', str(repo)] + list(args), check=True, capture_output=True).stdout


def sha(repo, ref):
    value = git(repo, 'rev-parse', '--verify', '--end-of-options', ref + '^{commit}').decode().strip()
    if not re.fullmatch(r'[a-f0-9]{40}', value):
        raise ValueError('Expected full commit SHA')
    return value


def normalized(data):
    return data.replace(b'\r\n', b'\n')


def scope(name):
    parts = Path(name).parts
    if any(part.startswith('.') or part in ('..', 'node_modules') for part in parts):
        return False
    return name in ('Procfile', 'package.json', 'package-lock.json', 'npm-shrinkwrap.json') or len(parts) == 1 and name.endswith('.js') or parts[0] == 'app'


def source(repo, commit, path):
    return git(repo, 'show', commit + ':' + path)


def target_path(target, name):
    path = target / name
    if path.is_symlink():
        raise ValueError('Symlink not allowed: ' + name)
    try:
        path.resolve().relative_to(target)
    except ValueError:
        raise ValueError('Path escapes target: ' + name)
    return path


def check_dependencies(target):
    package = json.loads((target / 'package.json').read_text(encoding='utf-8-sig'))
    dependencies = package.get('dependencies', {})
    if not re.match(r'^[~^]?6\.', dependencies.get('mongoose', '')) or not re.match(r'^[~^]?4\.', dependencies.get('express', '')):
        raise ValueError('Stop: this release procedure was tested with Mongoose 6 / Express 4; dependency changes require a separate review')
    scripts = package.get('scripts', {})
    if any(scripts.get(name) for name in ('preinstall', 'install', 'postinstall', 'heroku-prebuild', 'heroku-postbuild', 'release')):
        raise ValueError('Automatic install/build/release hooks require a separate review')
    if scripts.get('build') not in (None, '', "echo 'build script executed'", 'echo "build script executed"'):
        raise ValueError('Build script requires a separate review')
    procfile = target / 'Procfile'
    if procfile.exists() and re.search(r'^\s*release\s*:', procfile.read_text(), re.M):
        raise ValueError('Release phase requires a separate review')



def verify(target, base, candidate_repo, candidate, allow_test_script_change=False):
    target, candidate_repo = Path(target).resolve(strict=True), Path(candidate_repo).resolve(strict=True)
    base, candidate = sha(target, base), sha(candidate_repo, candidate)
    git(target, 'merge-base', '--is-ancestor', base, 'HEAD')
    head = sha(target, 'HEAD')
    committed = head != base
    if committed and not allow_test_script_change:
        changed = set(filter(None, git(target, 'diff', '--name-only', '-z', base, head).decode().split('\0')))
        if changed - set(RUNTIME + SUPPORT + ('server.js', 'app/config/constantes.js')):
            raise ValueError('Commit contains files outside the approved release patch')
    check_dependencies(target)
    paths = git(target, 'ls-tree', '-r', '--name-only', '-z', base).decode().split('\0')
    checked = 0
    for name in filter(scope, filter(None, paths)):
        expected = normalized(source(target, base, name))
        path = target_path(target, name)
        if not path.is_file():
            raise ValueError('Legacy file missing: ' + name)
        actual = normalized(path.read_bytes())
        if committed and actual != normalized(source(target, head, name)):
            raise ValueError('Tested working tree differs from committed legacy code: ' + name)
        if name == 'server.js':
            for line in SERVER_LINES:
                if actual.count(line.encode()) != 1:
                    raise ValueError('Unexpected server integration')
                actual = actual.replace(line.encode(), b'', 1)
        elif name == 'package.json' and allow_test_script_change:
            old_package, new_package = json.loads(expected), json.loads(actual)
            old_package.get('scripts', {}).pop('test', None)
            new_package.get('scripts', {}).pop('test', None)
            if old_package != new_package:
                raise ValueError('Production package metadata changed')
            actual = expected
        elif name == 'app/config/constantes.js':
            if actual.count(CONSTANT_LINE.encode()) != 1:
                raise ValueError('Unexpected collection registration')
            actual = actual.replace(CONSTANT_LINE.encode(), b'', 1)
        if actual != expected:
            raise ValueError('Legacy code changed: ' + name)
        checked += 1
    for name in RUNTIME + SUPPORT:
        actual = normalized(target_path(target, name).read_bytes())
        if committed and actual != normalized(source(target, head, name)):
            raise ValueError('New module is not committed as tested: ' + name)
        if actual != normalized(source(candidate_repo, candidate, name)):
            raise ValueError('Candidate file does not match pinned source: ' + name)
    return {
        'base_commit': base, 'candidate_commit': candidate,
        'target_commit': head, 'committed_tree_verified': committed,
        'legacy_files_preserved': checked, 'legacy_content_changes': [],
        'integration': 'Only exact additive server/collection registration; text CRLF normalized',
        'production_dependencies_start_and_lockfiles_preserved': True,
        'test_script_change_allowed': allow_test_script_change,
        'new_module_matches_candidate': True, 'network_calls': False, 'mongodb_operations': False,
        'note': 'This proves preservation against the supplied base, not that the base is the active Heroku release.'
    }


def prepare(target, base, candidate_repo, candidate):
    target, candidate_repo = Path(target).resolve(strict=True), Path(candidate_repo).resolve(strict=True)
    base, candidate = sha(target, base), sha(candidate_repo, candidate)
    if sha(target, 'HEAD') != base or git(target, 'status', '--porcelain').strip():
        raise ValueError('Target must be clean and HEAD must be the explicit base commit')
    check_dependencies(target)
    paths = git(target, 'ls-tree', '-r', '--name-only', '-z', base).decode().split('\0')
    for name in paths:
        if name == 'server.js' or name.startswith('app/routes/'):
            if b'/api/backtest' in source(target, base, name):
                raise ValueError('Existing backtest namespace requires a focused review')
    if any(name in paths for name in RUNTIME + SUPPORT):
        raise ValueError('Target already has candidate paths; do not overwrite them')
    pending = {}
    for name in RUNTIME + SUPPORT:
        path = target_path(target, name)
        if path.exists():
            raise ValueError('Refusing to overwrite local file: ' + name)
        pending[name] = source(candidate_repo, candidate, name)
    server = normalized(target_path(target, 'server.js').read_bytes()).decode('utf-8')
    constant = normalized(target_path(target, 'app/config/constantes.js').read_bytes()).decode('utf-8')
    anchor = "const errorMiddleware = require('./app/middleware/errors')\n"
    route = "        this.app.use(loginRouters, errorMiddleware)"
    if server.count(anchor) != 1 or server.count(route) != 1 or constant.count('    SchemaName: {\n') != 1 or 'backtestRouters' in server or 'backtestAprobados' in constant:
        raise ValueError('Unrecognized integration anchors; stop for a focused review, never force a patch')
    server = server.replace(anchor, anchor + SERVER_LINES[0], 1).replace(route, SERVER_LINES[1] + SERVER_LINES[2] + route, 1)
    constant = constant.replace('    SchemaName: {\n', '    SchemaName: {\n' + CONSTANT_LINE, 1)
    pending['server.js'], pending['app/config/constantes.js'] = server.encode(), constant.encode()
    # All compatibility/collision checks precede any local write. No checkout,
    # add, commit, push, npm hook or application execution occurs here.
    for name, data in pending.items():
        path = target_path(target, name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    return verify(target, base, candidate_repo, candidate)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['prepare', 'verify'])
    parser.add_argument('--target', required=True)
    parser.add_argument('--base', required=True)
    parser.add_argument('--candidate-repo', required=True)
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--allow-test-script-change', action='store_true', help='Verification of the GitHub PR only; never used to port v59')
    args = parser.parse_args()
    try:
        if args.mode == 'prepare':
            if args.allow_test_script_change:
                raise ValueError('Release preparation must preserve the original package manifest')
            report = prepare(args.target, args.base, args.candidate_repo, args.candidate)
        else:
            report = verify(args.target, args.base, args.candidate_repo, args.candidate, args.allow_test_script_change)
        print(json.dumps(report, indent=2))
        return 0
    except ValueError as error:
        print(json.dumps({'verified': False, 'reason': str(error), 'error': 'Stop; do not deploy. No network/deploy/MongoDB operation was performed.'}))
        return 1
    except (OSError, subprocess.CalledProcessError):
        print(json.dumps({'verified': False, 'error': 'Source/target unavailable. Stop; do not deploy. No network/deploy/MongoDB operation was performed.'}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
