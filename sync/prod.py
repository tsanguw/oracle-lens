"""One-off helper: run a step against the PRODUCTION (Neon) database using PROD_DATABASE_URL from the repo-root .env.

  python prod.py migrate     # apply any new SQL migration (api/migrations) to Neon
  python prod.py results     # fetch final placements into Neon
  python prod.py migrate results

The connection string is read from .env and never printed.
"""

import os
import subprocess
import sys
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parent.parent
STEPS = {
    "migrate": (["npm", "run", "migrate"], ROOT / "api"),
    "results": ([sys.executable, "main.py", "results"], ROOT / "sync"),
}


def main() -> int:
    steps = sys.argv[1:]
    if not steps or any(s not in STEPS for s in steps):
        print(__doc__)
        return 2
    url = dotenv_values(ROOT / ".env").get("PROD_DATABASE_URL")
    if not url:
        print("PROD_DATABASE_URL is empty in .env", file=sys.stderr)
        return 2
    env = {**os.environ, "DATABASE_URL": url}
    for step in steps:
        command, cwd = STEPS[step]
        print(f"== {step} (production)")
        result = subprocess.run(command, cwd=cwd, env=env, shell=(os.name == "nt"))
        if result.returncode:
            return result.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
