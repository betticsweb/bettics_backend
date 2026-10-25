"""Capture/compare unauthenticated GET guards only. No POST, credentials or DB client.
Does not prove authenticated behavior, backtest ingestion, source provenance or DB health.
"""
import argparse
import datetime
import json
from pathlib import Path
import urllib.error
import urllib.request

BASE = 'https://apianabet.herokuapp.com'
PATHS = (
    '/api/eventosLiga/getMaestros',
    '/api/eventosLiga/getTemporadas?strLeague=__BETTICS_SMOKE__',
    '/api/recomendaciones/getCriterio',
    '/api/resultados/getCriterio'
)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def status(url):
    request = urllib.request.Request(url, method='GET', headers={'Accept': 'application/json'})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=15) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
    except (OSError, urllib.error.URLError, TimeoutError):
        return None

def capture(transport=status):
    checks = [{'method': 'GET', 'path': path, 'status': transport(BASE + path)} for path in PATHS]
    return {
        'app': 'apianabet', 'captured_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'scope': 'Unauthenticated GET routing/authentication only; not functional or database validation',
        'release_verified_by_probe': False, 'all_guards_present': all(row['status'] == 401 for row in checks),
        'checks': checks, 'post_requests': 0, 'credentials_sent': False
    }

def compare(before, after):
    valid = before.get('all_guards_present') is True and after.get('all_guards_present') is True
    old = [(row.get('method'), row.get('path'), row.get('status')) for row in before.get('checks', [])]
    new = [(row.get('method'), row.get('path'), row.get('status')) for row in after.get('checks', [])]
    return {'legacy_guard_checks_unchanged': valid and old == new and len(old) == len(PATHS), 'after': after}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['capture', 'compare'])
    parser.add_argument('--baseline')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    try:
        if Path(args.output).exists():
            raise ValueError('Output exists; keep the original baseline')
        result = capture()
        if args.mode == 'compare':
            if not args.baseline:
                raise ValueError('Baseline required')
            result = compare(json.loads(Path(args.baseline).read_text(encoding='utf-8-sig')), result)
        with open(args.output, 'x', encoding='utf-8') as output:
            json.dump(result, output, indent=2)
        ok = result.get('all_guards_present', result.get('legacy_guard_checks_unchanged', False))
        print(json.dumps({'report_saved': True, 'checks_passed': ok, 'scope': 'GET/auth guards only; no deployment or DB client'}))
        return 0 if ok else 1
    except (OSError, ValueError):
        print(json.dumps({'checks_passed': False, 'error': 'Baseline/output invalid or unavailable'}))
        return 2

if __name__ == '__main__':
    raise SystemExit(main())
