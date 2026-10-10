"""Team logos, player photos and champion icon keys.

Logos and photos are fetched from Leaguepedia's file store once, shrunk to small WebP files and kept in our own
folder, so the site never loads images from Fandom's servers. Champion icons stay on Riot's Data Dragon CDN; we
only record each champion's Data Dragon key and the current game version.
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import time
import urllib.request
from pathlib import Path
from typing import Callable, Iterable

import psycopg
from PIL import Image

from .client import Leaguepedia

Log = Callable[[str], None]

DDRAGON = "https://ddragon.leagueoflegends.com"
LOGO_MAX_PX = 128  # shown at up to 64 CSS px, so 2x for sharp screens
PHOTO_MAX_PX = 256
BATCH = 50  # titles per imageinfo request (the MediaWiki limit for normal accounts)
DOWNLOAD_PAUSE_SEC = 0.25


def file_name(name: str) -> str:
    """A stable, URL-safe file name for an entity: readable slug plus a short hash so similar names never collide."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "image"
    return f"{slug}-{hashlib.sha1(name.encode('utf-8')).hexdigest()[:6]}.webp"


def to_webp(data: bytes, max_px: int) -> bytes:
    """Shrink an image to fit within max_px on its longest side (never enlarging) and encode it as WebP."""
    with Image.open(io.BytesIO(data)) as img:
        img = img.convert("RGBA")
        img.thumbnail((max_px, max_px), Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="WEBP", quality=85, method=6)
        return out.getvalue()


def _normalize(title: str) -> str:
    """MediaWiki's canonical file title: spaces for underscores, first letter capitalised."""
    t = title.replace("_", " ").strip()
    return t[:1].upper() + t[1:]


def image_infos(lp: Leaguepedia, filenames: Iterable[str]) -> dict[str, dict[str, str]]:
    """Original URL and sha1 for each Leaguepedia file name; files that do not exist are left out."""
    names = sorted({_normalize(n) for n in filenames if n})
    infos: dict[str, dict[str, str]] = {}
    for i in range(0, len(names), BATCH):
        batch = names[i : i + BATCH]
        result = lp.site.api("query", titles="|".join(f"File:{n}" for n in batch), prop="imageinfo", iiprop="url|sha1")
        for page in result.get("query", {}).get("pages", {}).values():
            info = (page.get("imageinfo") or [None])[0]
            title = page.get("title", "")
            if info and title.startswith("File:"):
                infos[_normalize(title[len("File:") :])] = {"url": info["url"], "sha1": info.get("sha1", "")}
        time.sleep(0.5)
    return infos


def download(lp: Leaguepedia, url: str) -> bytes:
    response = lp.site.connection.get(url, timeout=60)
    response.raise_for_status()
    return response.content


def _sync_kind(
    conn: psycopg.Connection,
    lp: Leaguepedia,
    out_dir: Path,
    *,
    kind: str,
    ours: dict[str, tuple[int, str | None, str | None]],
    wanted: dict[str, str],
    update_sql: str,
    max_px: int,
    log: Log,
    limit: int | None,
    priority: dict[str, int] | None = None,
    remote: set[str] | None = None,
) -> dict[str, int]:
    """Download and store the image for every entity of ours that Leaguepedia has a file name for."""
    folder = out_dir / kind
    folder.mkdir(parents=True, exist_ok=True)
    todo = {name: image for name, image in wanted.items() if name in ours}
    log(f"{kind}: {len(todo)} of {len(ours)} have an image on Leaguepedia")
    infos = image_infos(lp, todo.values())
    counts = {"downloaded": 0, "unchanged": 0, "missing": 0, "failed": 0}
    # Lower priority numbers go first (the players who matter most to visitors); the rest follow alphabetically.
    order = sorted(todo.items(), key=lambda kv: ((priority or {}).get(kv[0], 10**9), kv[0]))
    for name, image in order:
        info = infos.get(_normalize(image))
        entity_id, current_file, current_sha = ours[name]
        if not info:
            counts["missing"] += 1
            continue
        target = file_name(name)
        if current_file == target and current_sha == info["sha1"] and ((folder / target).exists() or (remote is not None and f"{kind}/{target}" in remote)):
            counts["unchanged"] += 1
            continue
        if limit is not None and counts["downloaded"] >= limit:
            break
        try:
            (folder / target).write_bytes(to_webp(download(lp, info["url"]), max_px))
        except Exception as exc:  # one bad file must not stop the run
            counts["failed"] += 1
            log(f"  failed {name}: {exc}")
            continue
        conn.execute(update_sql, (target, info["sha1"], entity_id))
        conn.commit()
        counts["downloaded"] += 1
        time.sleep(DOWNLOAD_PAUSE_SEC)
    log(f"{kind}: {counts}")
    return counts


def sync_team_logos(conn: psycopg.Connection, lp: Leaguepedia, out_dir: Path, log: Log = print, limit: int | None = None, remote: set[str] | None = None) -> dict[str, int]:
    ours = {name: (id_, f, sha) for id_, name, f, sha in conn.execute("SELECT id, name, logo_file, logo_sha1 FROM team")}
    wanted = {r["Name"]: r["Image"] for r in lp.cargo("Teams", "Name,Image", where="Image IS NOT NULL AND Image != ''")}
    return _sync_kind(
        conn, lp, out_dir, kind="teams", ours=ours, wanted=wanted, max_px=LOGO_MAX_PX, log=log, limit=limit, remote=remote,
        update_sql="UPDATE team SET logo_file = %s, logo_sha1 = %s, logo_tone = NULL WHERE id = %s",
    )


# Photo types that suit a small square avatar; full-body and half-length shots crop badly.
FACE_TYPES = {"headshot": 0, "portrait": 1, "profile": 2, "": 3}


def pick_photo(rows: Iterable[dict[str, str]]) -> str | None:
    """The newest face photo among one player's PlayerImages rows (any photo if they only have full-body shots)."""
    def rank(r: dict[str, str]) -> tuple[bool, str, int]:
        kind = (r.get("ImageType") or "").strip().lower()
        # Face photos beat the rest, then the newest date wins, then headshot over portrait over profile.
        return (kind in FACE_TYPES, r.get("SortDate") or "", -FACE_TYPES.get(kind, 9))

    usable = [r for r in rows if r.get("FileName")]
    return max(usable, key=rank)["FileName"] if usable else None


def player_photo_choices(lp: Leaguepedia) -> dict[str, str]:
    """player page -> chosen Leaguepedia file: newest PlayerImages face photo, else the player's own profile image."""
    by_player: dict[str, list[dict[str, str]]] = {}
    for r in lp.cargo("PlayerImages", "Link,FileName,ImageType,SortDate", where="FileName IS NOT NULL AND FileName != ''"):
        if r.get("Link"):
            by_player.setdefault(r["Link"], []).append(r)
    chosen = {page: pick for page, rows in by_player.items() if (pick := pick_photo(rows))}
    for r in lp.cargo("Players", "OverviewPage,Image", where="Image IS NOT NULL AND Image != ''"):
        chosen.setdefault(r["OverviewPage"], r["Image"])
    return chosen


def sync_player_photos(conn: psycopg.Connection, lp: Leaguepedia, out_dir: Path, log: Log = print, limit: int | None = None, remote: set[str] | None = None) -> dict[str, int]:
    ours = {name: (id_, f, sha) for id_, name, f, sha in conn.execute("SELECT id, name, photo_file, photo_sha1 FROM player")}
    # Most recently active players first, so the current rosters get their photos before the long tail.
    recent = conn.execute(
        """SELECT p.name FROM player p JOIN player_game pg ON pg.player_id = p.id JOIN game g ON g.id = pg.game_id
           GROUP BY p.name ORDER BY max(g.played_at) DESC NULLS LAST"""
    ).fetchall()
    priority = {name: i for i, (name,) in enumerate(recent)}
    return _sync_kind(
        conn, lp, out_dir, kind="players", ours=ours, wanted=player_photo_choices(lp), max_px=PHOTO_MAX_PX, log=log,
        limit=limit, priority=priority, remote=remote, update_sql="UPDATE player SET photo_file = %s, photo_sha1 = %s WHERE id = %s",
    )


def sync_champion_icons(conn: psycopg.Connection, log: Log = print) -> dict[str, int]:
    """Record each champion's Data Dragon key and the current Data Dragon version (no files are downloaded)."""
    version = json.load(urllib.request.urlopen(f"{DDRAGON}/api/versions.json", timeout=30))[0]
    data = json.load(urllib.request.urlopen(f"{DDRAGON}/cdn/{version}/data/en_US/champion.json", timeout=30))["data"]
    keys = {c["name"]: key for key, c in data.items()}
    matched, unmatched = 0, []
    for champ_id, name in conn.execute("SELECT id, name FROM champion").fetchall():
        key = keys.get(name)
        if key:
            conn.execute("UPDATE champion SET icon_key = %s WHERE id = %s", (key, champ_id))
            matched += 1
        else:
            unmatched.append(name)
    conn.execute(
        """INSERT INTO meta (key, value) VALUES ('ddragon_version', %s)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value""",
        (version,),
    )
    conn.commit()
    log(f"champions: {matched} icon keys set (Data Dragon {version})" + (f"; no icon for {unmatched}" if unmatched else ""))
    return {"matched": matched, "unmatched": len(unmatched)}
