"""Fail if a tracked file looks like it contains a secret. Prints where, never what.

  python scripts/scan_secrets.py            # every git-tracked text file, against known secret shapes
  python scripts/scan_secrets.py --env      # also look for the real values in the repo-root .env (run this one on your machine)
  python scripts/scan_secrets.py --history  # also every line ever added in any commit, so a secret that was committed and then deleted is still caught

A line can opt out with the words `scan-secrets: ignore` in a comment. Throwaway local settings (a Postgres URL on
localhost, the placeholders in .env.example) are not treated as secrets.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2", ".svg", ".lock"}
SKIP_NAMES = {"package-lock.json"}
# The scanner's own tests hold fake keys on purpose, to prove the patterns catch them. Nothing else is exempt.
SKIP_PATHS = {"sync/tests/test_scan_secrets.py"}
# .env entries that are public by design (a bucket name, the bucket's public address) or not secrets at all
PUBLIC_KEYS = {"R2_BUCKET", "R2_PUBLIC_URL", "PORT"}
LOCAL_HOSTS = ("localhost", "127.0.0.1", "[::1]", "db", "example.com", "host")

PATTERNS: dict[str, re.Pattern[str]] = {
    "private key block": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "AWS access key id": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "GitHub token": re.compile(r"\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b"),
    "Slack token": re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"),
    "Google API key": re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"),
    "OpenAI-style key": re.compile(r"\bsk-[A-Za-z0-9]{32,}\b"),
}
DB_URL = re.compile(r"postgres(?:ql)?://([^:/\s@]+):([^@\s'\"]+)@([^/\s:'\"]+)")
ASSIGNED = re.compile(r"""(?i)(?<![a-z])(?:password|passwd|secret|token|api[_-]?key|access[_-]?key)\w*["']?\s*[:=]\s*["']([^"'\s]{12,})["']""")


def is_placeholder(value: str) -> bool:
    """Identifiers, templates and obvious fillers: a real secret has digits, and is not a variable name."""
    # a variable name (R2_SECRET_ACCESS_KEY, access_key) or a template, not a value
    return bool(re.fullmatch(r"[A-Za-z_][A-Za-z_.\-]*|[A-Z][A-Z0-9_]+", value)) or any(x in value for x in ("${", "{{", "<", "process.env", "secrets."))


def tracked_files() -> list[Path]:
    out = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True).stdout.decode("utf-8", "replace")
    return [ROOT / p for p in out.split("\0") if p]


def scan_text(name: str, text: str) -> list[str]:
    """Findings for one file's text, as 'file:line: what' (the matched text is never included)."""
    found: list[str] = []
    for no, line in enumerate(text.splitlines(), start=1):
        if "scan-secrets: ignore" in line:
            continue
        for label, pattern in PATTERNS.items():
            if pattern.search(line):
                found.append(f"{name}:{no}: {label}")
        for _user, password, host in DB_URL.findall(line):
            if host not in LOCAL_HOSTS and not is_placeholder(password):
                found.append(f"{name}:{no}: database URL with a password for a non-local host")
        for value in ASSIGNED.findall(line):
            if not is_placeholder(value):
                found.append(f"{name}:{no}: a password, token or key assigned a literal value")
    return found


def scan_history() -> list[str]:
    """Findings in lines added by any commit on any branch, as 'commit file: what'."""
    log = subprocess.run(
        ["git", "log", "--all", "-p", "-U0", "--no-color", "--format=commit %H"], cwd=ROOT, capture_output=True, check=True
    ).stdout.decode("utf-8", "replace")
    found: list[str] = []
    commit = path = ""
    for line in log.splitlines():
        if line.startswith("commit ") and len(line) == 47:
            commit = line[7:15]
        elif line.startswith("+++ b/"):
            path = line[6:]
        elif line.startswith("+") and not line.startswith("+++"):
            if Path(path).suffix.lower() in SKIP_SUFFIXES or Path(path).name in SKIP_NAMES or path in SKIP_PATHS:
                continue
            for hit in scan_text(f"{commit} {path}", line[1:]):
                found.append(hit.replace(":1:", ":", 1))
    return sorted(set(found))


def env_values() -> dict[str, str]:
    """Real values from .env worth searching for (skips short ones and throwaway local settings)."""
    from dotenv import dotenv_values

    values = {}
    for key, value in dotenv_values(ROOT / ".env").items():
        if not value or len(value) < 12 or key in PUBLIC_KEYS:
            continue
        match = DB_URL.search(value)
        if match and match.group(3) in LOCAL_HOSTS:
            continue
        values[key] = value
    return values


def main(argv: list[str]) -> int:
    findings: list[str] = []
    secrets = env_values() if "--env" in argv else {}
    for path in tracked_files():
        if path.suffix.lower() in SKIP_SUFFIXES or path.name in SKIP_NAMES or not path.is_file():
            continue
        if path.relative_to(ROOT).as_posix() in SKIP_PATHS:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        name = path.relative_to(ROOT).as_posix()
        findings += scan_text(name, text)
        for key, value in secrets.items():
            if value in text:
                findings.append(f"{name}: contains the real value of {key} from .env")
    if "--history" in argv:
        findings += scan_history()
    if findings:
        print("Possible secrets found (values not shown):")
        print("\n".join(f"  {f}" for f in findings))
        return 1
    print(f"No secrets found in {len(tracked_files())} tracked files" + (f", including the {len(secrets)} real values from .env" if secrets else "") + (" and every commit's added lines" if "--history" in argv else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
