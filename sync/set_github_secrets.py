"""One-off: copy the production settings from the repo-root .env into this repo's GitHub Actions secrets.

  python set_github_secrets.py

Needs the GitHub CLI (`gh`) logged in. Values are piped to `gh secret set` and never printed.
"""

import subprocess
import sys
from pathlib import Path

from dotenv import dotenv_values

REPO = "tsanguw/oracle-lens"
SECRETS = {  # secret name -> key in .env
    "DATABASE_URL": "PROD_DATABASE_URL",
    "LEAGUEPEDIA_BOT_USER": "LEAGUEPEDIA_BOT_USER",
    "LEAGUEPEDIA_BOT_PASSWORD": "LEAGUEPEDIA_BOT_PASSWORD",
    "R2_ACCOUNT_ID": "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID": "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY": "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET": "R2_BUCKET",
}

env = dotenv_values(Path(__file__).resolve().parent.parent / ".env")
failed = 0
for secret, key in SECRETS.items():
    value = env.get(key) or ""
    if not value:
        print(f"{secret}: {key} is empty in .env, skipped")
        failed += 1
        continue
    result = subprocess.run(["gh", "secret", "set", secret, "--repo", REPO], input=value, text=True, capture_output=True)
    print(f"{secret}: " + ("set" if result.returncode == 0 else "FAILED " + result.stderr.strip()[:100]))
    failed += result.returncode != 0
sys.exit(1 if failed else 0)
