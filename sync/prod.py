"""One-off helper: run a step against the PRODUCTION (Neon) database using PROD_DATABASE_URL from the repo-root .env.

  python prod.py migrate     # apply any new SQL migration (api/migrations) to Neon
  python prod.py results     # fetch final placements into Neon
  python prod.py logo-tones  # measure team logos (reads them from R2 when you have R2_* in .env)
  python prod.py schedule    # fetch every series' round and date from Leaguepedia (the full table takes about ten minutes)
  python prod.py migrate results logo-tones

The connection string is read from .env and never printed.
"""

import os
import subprocess
import sys
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parent.parent
# The sync steps need the packages in sync/.venv, whichever Python started this script.
_VENV = ROOT / "sync" / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
PYTHON = str(_VENV) if _VENV.exists() else sys.executable
STEPS = {
    "migrate": (["npm", "run", "migrate"], ROOT / "api"),
    "results": ([PYTHON, "main.py", "results"], ROOT / "sync"),
    "logo-tones": ([PYTHON, "main.py", "logo-tones"], ROOT / "sync"),
    "schedule": ([PYTHON, "main.py", "schedule"], ROOT / "sync"),
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
