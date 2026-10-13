import re
from pathlib import Path

from lolsync.backfill import ROLES

MIGRATION = Path(__file__).resolve().parents[2] / "api" / "migrations" / "017_role_and_stage_checks.sql"


def test_the_sync_accepts_exactly_the_roles_the_database_allows():
    sql = MIGRATION.read_text(encoding="utf-8")
    listed = re.search(r"player_game_role_check CHECK \(role IN \(([^)]*)\)\)", sql)
    assert listed, "the role CHECK was not found in migration 017"
    assert set(re.findall(r"'([^']+)'", listed.group(1))) == ROLES


def test_a_role_is_matched_exactly_not_loosely():
    assert "Mid" in ROLES
    assert not {"mid", "MID", "Mid ", "ADC", "Sub", ""} & ROLES
