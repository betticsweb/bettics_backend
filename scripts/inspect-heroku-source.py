"""GET-only Heroku source/config-presence inspection. Never prints secret values.
Use existing proxy authentication or HEROKU_API_KEY supplied securely in the environment.
Does not create releases/dynos, deploy, set config, or call ingestion endpoints.
"""
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

APP = "apianabet"

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def get(path):
    headers = {"Accept": "application/vnd.heroku+json; version=3"}
    token = os.environ.get("HEROKU_API_KEY")
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request("https://api.heroku.com" + path, headers=headers, method="GET")
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=20) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, None
    except (urllib.error.URLError, TimeoutError, OSError):
        return None, None


def inspect():
    report = {"app": APP, "production_mutations": False}
    status, app = get("/apps/" + APP)
    report["app_http"] = status
    report["app_name_matches"] = isinstance(app, dict) and app.get("name") == APP
    status, builds = get("/apps/" + APP + "/builds")
    report["builds_http"] = status
    if isinstance(builds, list) and builds:
        build = max(builds, key=lambda item: item.get("created_at", ""))
        source = build.get("source_blob") or {}
        version = source.get("version", "")
        report["latest_build_status"] = build.get("status")
        report["latest_build_commit"] = version if isinstance(version, str) and re.match(r"^[a-fA-F0-9]{40}$", version) else None
        parsed = urllib.parse.urlparse(source.get("url") or "")
        # Retain only a repository identity from known public GitHub URL shapes;
        # source-blob URLs can contain credentials or expiring access signatures.
        parts = parsed.path.strip("/").split("/")
        if parsed.hostname == "github.com" and len(parts) >= 2:
            report["source_repository_hint"] = "/".join(parts[:2]).removesuffix(".git")
    status, releases = get("/apps/" + APP + "/releases")
    report["releases_http"] = status
    if isinstance(releases, list) and releases:
        release = max(releases, key=lambda item: item.get("version", 0))
        report["latest_release_version"] = release.get("version")
        slug_id = (release.get("slug") or {}).get("id")
        if isinstance(slug_id, str) and re.match(r"^[a-fA-F0-9-]{36}$", slug_id):
            slug_status, slug = get("/apps/" + APP + "/slugs/" + slug_id)
            report["slug_http"] = slug_status
            commit = slug.get("commit") if isinstance(slug, dict) else None
            report["deployed_slug_commit"] = commit if isinstance(commit, str) and re.match(r"^[a-fA-F0-9]{40}$", commit) else None
    status, config = get("/apps/" + APP + "/config-vars")
    report["config_http"] = status
    if status == 200 and isinstance(config, dict):
        report["environment_presence"] = {key: bool(config.get(key)) for key in ("USR_NAME", "PSS_WORD", "CLU", "BETTICS_ETL_TOKEN")}
    return report


if __name__ == "__main__":
    print(json.dumps(inspect(), indent=2))
