"""Cache the Legends of Runeterra card art as small WebP files, so the site can serve it from our own bucket.

The headers show full-width card art. Riot's copies are 1.4-1.7 MB PNGs; the same 2048x1024 image as a WebP is a few
hundred KB. Files are saved as <out>/art/<card code>.webp and uploaded to R2 by `main.py upload-images` (the site falls
back to Riot's CDN for any card that is not there). The list of cards is read from the frontend's runeterra.ts, which is
the one place that says which card belongs to which champion.
"""

from __future__ import annotations

import io
import re
import urllib.request
from pathlib import Path
from typing import Callable

from PIL import Image

Log = Callable[[str], None]
CARD_URL = "https://dd.b.pvp.net/latest/set{set}/en_us/img/cards/{code}-full.png"
USER_AGENT = "lol-stats-portfolio/0.1 (+https://github.com/tsanguw)"
QUALITY = 80
ROW = re.compile(r'^\s+"[^"]+": \[(\d+), "(\w+)",', re.MULTILINE)


def card_list(runeterra_ts: str) -> list[tuple[int, str]]:
    """(set number, card code) for every champion card listed in runeterra.ts, in file order."""
    return [(int(s), code) for s, code in ROW.findall(runeterra_ts)]


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def to_webp(png: bytes) -> bytes:
    out = io.BytesIO()
    Image.open(io.BytesIO(png)).convert("RGB").save(out, "WEBP", quality=QUALITY, method=6)
    return out.getvalue()


def cache_art(
    cards: list[tuple[int, str]],
    out: Path,
    log: Log = print,
    get: Callable[[str], bytes] = download,
    limit: int | None = None,
    redo: bool = False,
) -> dict[str, int]:
    """Download and convert each card that is not already in <out>/art. Returns counts of saved, skipped and failed."""
    folder = out / "art"
    folder.mkdir(parents=True, exist_ok=True)
    counts = {"saved": 0, "skipped": 0, "failed": 0}
    for set_no, code in cards:
        target = folder / f"{code}.webp"
        if target.exists() and not redo:
            counts["skipped"] += 1
            continue
        if limit is not None and counts["saved"] >= limit:
            break
        try:
            webp = to_webp(get(CARD_URL.format(set=set_no, code=code)))
        except Exception as exc:  # one bad card should not stop the rest
            counts["failed"] += 1
            log(f"  {code}: {str(exc)[:100]}")
            continue
        target.write_bytes(webp)
        counts["saved"] += 1
        if counts["saved"] % 10 == 0:
            log(f"art: {counts['saved']} saved")
    log(f"art: {counts}")
    return counts
