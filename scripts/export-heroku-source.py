"""Export selected committed Node source, never the working tree or Git history.
Known secret patterns block the ZIP. Manual review is still mandatory: no scanner
can guarantee the absence of credentials embedded in arbitrary application code.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile

ROOT_FILES = {"Procfile", "package.json", "package-lock.json", "npm-shrinkwrap.json"}
SUFFIXES = {".js", ".json", ".hbs", ".handlebars", ".html"}
MAX_FILE = 8 * 1024 * 1024
MAX_TOTAL = 32 * 1024 * 1024

class ExportBlocked(ValueError):
    pass


def selected(name):
    parts = Path(name).parts
    if not parts or any(part.startswith('.') or part in ('..', 'node_modules') for part in parts):
        return False
    if re.search(r'(?:credential|private.?key|service.?account|secret)', Path(name).name, re.I):
        return False
    return name in ROOT_FILES or len(parts) == 1 and Path(name).suffix == '.js' or parts[0] == 'app' and Path(name).suffix in SUFFIXES


def suspected_secret(data):
    try:
        text = data.decode('utf-8-sig')
    except UnicodeDecodeError:
        return True
    if re.search(r'-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|SG\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)', text):
        return True
    if re.search(r'\b[a-z][a-z0-9+.-]*://[^\s/\'"`:@${]+:[^\s/\'"`@${]+@', text, re.I):
        return True
    if re.search(r'[?&](?:access_token|api_key|signature|token)=[^\s\'"&${]+', text, re.I):
        return True
    patterns = [
        r'''(?:password|passwd|pwd|pss_word|secret|token|api[_-]?key|key_jwt)[A-Za-z0-9_]*\s*["']?\s*[:=]\s*["']([^"'\r\n]*)["']''',
        r'''setApiKey\(\s*["']([^"'\r\n]*)["']'''
    ]
    for pattern in patterns:
        for value in re.findall(pattern, text, re.I):
            stripped = value.strip()
            if not stripped or stripped == 'Bearer' or stripped == 'REDACTED_FOR_SHARING' or '${' in value or 'process.env.' in value:
                continue
            return True
    for value in re.findall(r'\b[A-Za-z_]*(?:TOKEN|PASSWORD|PSS_WORD|SECRET|API_KEY|KEY_JWT)[A-Za-z_]*=([^\s"\';]+)', text, re.I):
        if not value.startswith(('$', '%')) and value != 'REDACTED_FOR_SHARING':
            return True
    return False


def git(repo, *args):
    return subprocess.run(['git', '-C', str(repo)] + list(args), capture_output=True, check=True).stdout


def export(repo, commit, output, sanitized=None, release=None):
    repo = Path(repo).resolve(strict=True)
    output = Path(output)
    if output.exists():
        raise ExportBlocked('Output already exists; nothing was overwritten')
    if not re.fullmatch(r'[a-fA-F0-9]{40}', commit):
        raise ExportBlocked('An explicit full release commit SHA is required')
    if release and not re.fullmatch(r'v[1-9][0-9]*', release):
        raise ExportBlocked('Release must be an explicit v-number')
    sha = git(repo, 'rev-parse', '--verify', '--end-of-options', commit + '^{commit}').decode().strip()
    if sha.lower() != commit.lower():
        raise ExportBlocked('Release commit mismatch')
    sanitized = Path(sanitized).resolve(strict=True) if sanitized else None
    files, blocked, redacted, excluded = {}, [], [], []
    total = 0
    for entry in git(repo, 'ls-tree', '-rz', '--full-tree', sha).split(b'\0'):
        if not entry:
            continue
        metadata, raw_name = entry.split(b'\t', 1)
        mode, kind, oid = metadata.decode().split(' ')
        name = raw_name.decode()
        if not selected(name):
            excluded.append(name)
            continue
        if kind != 'blob' or mode not in ('100644', '100755') or int(git(repo, 'cat-file', '-s', oid)) > MAX_FILE:
            blocked.append(name)
            continue
        data = git(repo, 'cat-file', 'blob', oid)
        if sanitized:
            replacement = sanitized / name
            if replacement.exists() or replacement.is_symlink():
                try:
                    replacement.resolve(strict=True).relative_to(sanitized)
                except (ValueError, OSError):
                    blocked.append(name); continue
                if replacement.is_symlink() or not replacement.is_file() or replacement.stat().st_size > MAX_FILE:
                    blocked.append(name); continue
                data = replacement.read_bytes()
                redacted.append(name)
        if suspected_secret(data):
            blocked.append(name)
            continue
        total += len(data)
        if total > MAX_TOTAL:
            raise ExportBlocked('Selected source exceeds the 32 MiB sharing limit')
        files[name] = data
    if blocked:
        # Filenames only, never matching secret values or source snippets.
        raise ExportBlocked('No ZIP created. Review/redact these files in a SEPARATE copy: ' + ', '.join(sorted(set(blocked))))
    if 'package.json' not in files:
        raise ExportBlocked('Selected commit has no shareable package.json; snapshot would be incomplete')
    manifest = {
        'operator_app': 'apianabet', 'operator_reported_release': release, 'source_commit': sha,
        'source': 'git blobs at the explicit commit; no working-tree files or Git history',
        'manual_review_required': True, 'redacted_or_replaced_files': sorted(redacted),
        'excluded_paths': sorted(excluded),
        'files': {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())}
    }
    with output.open('xb') as destination:
        with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for name, data in sorted(files.items()):
                archive.writestr(name, data)
            archive.writestr('snapshot-manifest.json', json.dumps(manifest, indent=2))
    return {'zip': output.name, 'commit': sha, 'file_count': len(files), 'redacted_or_replaced_files': sorted(redacted), 'manual_review_required': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--release', help='Release version reported by the operator, for example v59')
    parser.add_argument('--sanitized', help='Separate directory containing manually redacted replacements at matching relative paths')
    args = parser.parse_args()
    try:
        print(json.dumps(export(args.repo, args.commit, args.output, args.sanitized, args.release), indent=2))
    except ExportBlocked as error:
        print(str(error))
        return 1
    except (OSError, subprocess.CalledProcessError):
        print('Source/output unavailable; no deploy, checkout or MongoDB operation was attempted')
        return 2
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
