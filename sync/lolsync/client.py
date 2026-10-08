"""Leaguepedia Cargo access: bot login when credentials exist, throttling, backoff."""

from __future__ import annotations

import os
import time
from typing import Any, Iterator

import mwclient
from mwclient.errors import APIError

from .normalize import clean_row

USER_AGENT = "lol-stats-portfolio/0.1 (+https://github.com/tsanguw)"
PAGE_SIZE = 500
THROTTLE_SEC = 1.0
MAX_ATTEMPTS = 6


class Leaguepedia:
    def __init__(self) -> None:
        self.site = mwclient.Site(
            "lol.fandom.com", path="/", scheme="https", clients_useragent=USER_AGENT
        )
        user = os.environ.get("LEAGUEPEDIA_BOT_USER", "").strip()
        password = os.environ.get("LEAGUEPEDIA_BOT_PASSWORD", "").strip()
        self.authenticated = bool(user and password)
        if self.authenticated:
            self.site.login(user, password)

    def _query(self, params: dict[str, str]) -> list[dict[str, Any]]:
        for attempt in range(MAX_ATTEMPTS):
            try:
                result = self.site.api("cargoquery", **params)
            except APIError as exc:
                result = {"error": {"code": exc.code}}
            error = result.get("error")
            if not error:
                return [clean_row(r["title"]) for r in result["cargoquery"]]
            if error.get("code") != "ratelimited":
                raise RuntimeError(f"cargoquery failed: {error}")
            time.sleep(5 * 2**attempt)
        raise RuntimeError("cargoquery rate-limited after all retries")

    def cargo(
        self,
        tables: str,
        fields: str,
        where: str | None = None,
        order_by: str | None = None,
        join_on: str | None = None,
    ) -> Iterator[dict[str, Any]]:
        """Yield every matching row, paging with throttling between requests."""
        offset = 0
        while True:
            params = {"tables": tables, "fields": fields, "limit": str(PAGE_SIZE), "offset": str(offset)}
            if where:
                params["where"] = where
            if order_by:
                params["order_by"] = order_by
            if join_on:
                params["join_on"] = join_on
            rows = self._query(params)
            yield from rows
            if len(rows) < PAGE_SIZE:
                return
            offset += PAGE_SIZE
            time.sleep(THROTTLE_SEC)
