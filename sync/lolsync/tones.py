"""Is a team logo too dark to see on our dark panels? Measured once per logo, stored as team.logo_tone."""

from __future__ import annotations

import io
from pathlib import Path
from typing import Callable

import psycopg
from PIL import Image

Log = Callable[[str], None]

DARK_PANEL = (20, 25, 34)  # --bg-panel, what logos normally sit on
LIGHT_PLATE = (228, 232, 238)  # --plate, what dark logos are shown on
LOW_CONTRAST = 2.0  # below this ratio an artwork pixel is hard to make out
SHARE = 0.5  # a logo is "dark" when at least this share of its visible pixels is hard to see on the dark panel
OPAQUE = 0.95  # a logo that fills this much of its square brings its own backdrop and needs no plate


def _channel(c: float) -> float:
    c /= 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def luminance(rgb: tuple[int, int, int]) -> float:
    r, g, b = rgb
    return 0.2126 * _channel(r) + 0.7152 * _channel(g) + 0.0722 * _channel(b)


def contrast(a: float, b: float) -> float:
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


def logo_tone(img: Image.Image) -> str:
    """'dark' (needs a light plate), 'light' (fine on the dark panel) or 'neutral'."""
    rgba = img.convert("RGBA")
    raw = rgba.tobytes()
    visible = [(raw[i], raw[i + 1], raw[i + 2]) for i in range(0, len(raw), 4) if raw[i + 3] > 128]
    if not visible or len(visible) / (rgba.width * rgba.height) >= OPAQUE:
        return "neutral"
    on_dark, on_light = luminance(DARK_PANEL), luminance(LIGHT_PLATE)
    lums = [luminance(p) for p in visible]
    hard_on_dark = sum(1 for l in lums if contrast(l, on_dark) < LOW_CONTRAST) / len(lums)
    hard_on_light = sum(1 for l in lums if contrast(l, on_light) < LOW_CONTRAST) / len(lums)
    if hard_on_dark >= SHARE:
        return "dark"
    if hard_on_light >= SHARE:
        return "light"
    return "neutral"


def classify_logos(
    conn: psycopg.Connection, out_dir: Path, r2_client=None, bucket: str | None = None, log: Log = print, redo: bool = False
) -> dict[str, int]:
    """Set logo_tone for teams that have a logo and no tone yet (or all of them with `redo`).

    The file is read from `out_dir/teams/` when it is there, otherwise from the R2 bucket, so this works both
    on a machine that cached the images and on a runner that only knows the bucket.
    """
    rows = conn.execute(
        "SELECT id, logo_file FROM team WHERE logo_file IS NOT NULL" + ("" if redo else " AND logo_tone IS NULL")
    ).fetchall()
    counts = {"dark": 0, "light": 0, "neutral": 0, "skipped": 0}
    for team_id, file in rows:
        local = out_dir / "teams" / file
        data: bytes | None = None
        if local.exists():
            data = local.read_bytes()
        elif r2_client is not None and bucket:
            try:
                data = r2_client.get_object(Bucket=bucket, Key=f"teams/{file}")["Body"].read()
            except Exception:  # not uploaded yet; try again next run
                data = None
        if data is None:
            counts["skipped"] += 1
            continue
        tone = logo_tone(Image.open(io.BytesIO(data)))
        conn.execute("UPDATE team SET logo_tone = %s WHERE id = %s", (tone, team_id))
        counts[tone] += 1
    conn.commit()
    log(f"logo tones: {counts}")
    return counts
