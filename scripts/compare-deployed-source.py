"""Offline, read-only comparison of a Heroku source snapshot and a Git commit.
No network, deploy, checkout, secret-file reads or MongoDB operations.
The caller must establish snapshot/release provenance independently.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

ROOT_FILES = {"Procfile", "package.json", "package-lock.json", "npm-shrinkwrap.json"}
SUFFIXES = {".js", ".json", ".hbs", ".handlebars", ".html"}
MAX_FILE = 8 * 1024 * 1024


def in_scope(name):
    parts = Path(name).parts
    if not parts or any(part in ("..", ".git", "node_modules") or part.startswith(".") for part in parts):
        return False
    if name in ROOT_FILES or len(parts) == 1 and Path(name).suffix == ".js":
        return True
    return parts[0] == "app" and Path(name).suffix in SUFFIXES


def git(repo, *args):
    result = subprocess.run(["git", "-C", str(repo)] + list(args), capture_output=True, check=True)
    return result.stdout


def compare(repo, deployed, ref, release_commit=None):
    repo = Path(repo).resolve(strict=True)
    deployed = Path(deployed).resolve(strict=True)
    sha = git(repo, "rev-parse", "--verify", "--end-of-options", ref + "^{commit}").decode().strip()
    if not re.fullmatch(r"[a-f0-9]{40}", sha):
        raise ValueError("Full commit SHA required")
    if release_commit and not re.fullmatch(r"[a-fA-F0-9]{40}", release_commit):
        raise ValueError("Release commit must be a full SHA, not a branch name")
    reference = {}
    unsafe = []
    for entry in git(repo, "ls-tree", "-rz", "--full-tree", sha).split(b"\0"):
        if not entry:
            continue
        metadata, raw_name = entry.split(b"\t", 1)
        mode, object_type, oid = metadata.decode().split(" ")
        name = raw_name.decode()
        if not in_scope(name):
            continue
        if object_type != "blob" or mode not in ("100644", "100755"):
            unsafe.append(name)
            continue
        size = int(git(repo, "cat-file", "-s", oid))
        if size > MAX_FILE:
            unsafe.append(name)
            continue
        reference[name] = hashlib.sha256(git(repo, "cat-file", "blob", oid)).hexdigest()
    deployed_hashes = {}
    roots = [deployed]
    if (deployed / "app").is_symlink():
        unsafe.append("app")
    elif (deployed / "app").is_dir():
        for root, dirs, _files in os.walk(deployed / "app", followlinks=False):
            allowed = []
            for directory in dirs:
                path = Path(root) / directory
                if path.is_symlink():
                    unsafe.append(path.relative_to(deployed).as_posix())
                elif not directory.startswith(".") and directory != "node_modules":
                    allowed.append(directory)
            dirs[:] = allowed
            roots.append(Path(root))
    for root in roots:
        for path in root.iterdir():
            name = path.relative_to(deployed).as_posix()
            if not in_scope(name) or path.is_dir():
                continue
            if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(deployed) or path.stat().st_size > MAX_FILE:
                unsafe.append(name)
                continue
            deployed_hashes[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    missing = sorted(set(reference) - set(deployed_hashes))
    extra = sorted(set(deployed_hashes) - set(reference))
    changed = sorted(name for name in set(reference) & set(deployed_hashes) if reference[name] != deployed_hashes[name])
    incomplete = bool(unsafe) or "package.json" not in reference or "package.json" not in deployed_hashes
    return {
        "reference_commit": sha,
        "operator_supplied_release_commit": release_commit,
        "release_commit_matches_reference": bool(release_commit) and release_commit.lower() == sha,
        "snapshot_provenance_verified_by_script": False,
        "scope": "root Node entrypoints/manifests/Procfile and app code/templates; excludes secret files, dependencies, CI, tests and root build directories",
        "reference_file_count": len(reference), "snapshot_file_count": len(deployed_hashes),
        "missing": missing, "extra": extra, "changed": changed, "unsafe_or_unreadable": sorted(set(unsafe)),
        "comparison_complete": not incomplete,
        "scoped_files_identical": not incomplete and not (missing or extra or changed),
        "production_mutations": False
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=".")
    parser.add_argument("--deployed", required=True, help="Trusted source snapshot directory, not a URL or an unverified remote HEAD")
    parser.add_argument("--ref", required=True, help="Local Git reference to compare; no fetch or checkout is performed")
    parser.add_argument("--release-commit", help="Full SHA read from the actual active Heroku release")
    args = parser.parse_args()
    try:
        report = compare(args.repo, args.deployed, args.ref, args.release_commit)
        print(json.dumps(report, indent=2))
        return 0 if report["scoped_files_identical"] else 1
    except (ValueError, OSError, subprocess.CalledProcessError):
        print(json.dumps({"comparison_complete": False, "error": "Source/reference unavailable or invalid; nothing changed"}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
