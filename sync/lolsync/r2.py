"""Upload the cached team logos and player photos to Cloudflare R2 (S3-compatible, public bucket).

Files are named with a content hash of the entity name, and a changed image gets a new sha1 but keeps its name, so
uploads overwrite by key. Only keys that are missing from the bucket are uploaded, which keeps the nightly run to a
handful of requests.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Callable, Iterable

Log = Callable[[str], None]
KINDS = ("teams", "players")
CACHE = "public, max-age=31536000, immutable"


def client_from_env():
    import boto3  # imported here so the rest of the sync does not need it

    account = os.environ["R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def existing_keys(client, bucket: str, prefixes: Iterable[str]) -> set[str]:
    keys: set[str] = set()
    paginator = client.get_paginator("list_objects_v2")
    for prefix in prefixes:
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            keys.update(obj["Key"] for obj in page.get("Contents", []))
    return keys


def upload_images(client, bucket: str, folder: Path, log: Log = print, kinds: Iterable[str] = KINDS) -> dict[str, int]:
    """Upload every WebP under folder/<kind>/ that the bucket does not have yet."""
    kinds = list(kinds)
    have = existing_keys(client, bucket, [f"{k}/" for k in kinds])
    counts = {"uploaded": 0, "skipped": 0}
    for kind in kinds:
        for path in sorted((folder / kind).glob("*.webp")):
            key = f"{kind}/{path.name}"
            if key in have:
                counts["skipped"] += 1
                continue
            client.put_object(Bucket=bucket, Key=key, Body=path.read_bytes(), ContentType="image/webp", CacheControl=CACHE)
            counts["uploaded"] += 1
    log(f"r2: {counts}")
    return counts
