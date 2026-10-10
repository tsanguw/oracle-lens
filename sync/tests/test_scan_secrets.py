import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("scan_secrets", Path(__file__).resolve().parents[2] / "scripts" / "scan_secrets.py")
scan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scan)


def found(text: str) -> list[str]:
    return scan.scan_text("f.txt", text)


def test_flags_a_database_url_with_a_password_on_a_real_host_without_printing_it():
    hits = found("DATABASE_URL=postgresql://app:Sup3rSecretPw@ep-cool-name.us-west-2.aws.neon.tech/db?sslmode=require")
    assert hits == ["f.txt:1: database URL with a password for a non-local host"]
    assert "Sup3rSecretPw" not in hits[0]


def test_allows_the_throwaway_local_database_and_placeholders():
    assert found("DATABASE_URL=postgresql://lolstats:lolstats@localhost:5432/lolstats") == []
    assert found("url: postgresql://user:${DB_PASSWORD}@host.example.net/db") == []
    assert found("postgres://user:<password>@db.internal/x") == []


def test_flags_known_token_shapes():
    assert found("-----BEGIN RSA PRIVATE KEY-----")[0].endswith("private key block")
    assert found("key = AKIAABCDEFGHIJKLMNOP")[0].endswith("AWS access key id")
    assert found("t = ghp_" + "a1B2c3D4e5" * 4)[0].endswith("GitHub token")


def test_flags_a_literal_secret_assignment_but_not_a_variable_name_or_template():
    assert found('R2_SECRET_ACCESS_KEY = "9f8e7d6c5b4a39281706f5e4d3c2b1a0"')[0].endswith("assigned a literal value")
    assert found('"LEAGUEPEDIA_BOT_PASSWORD": "LEAGUEPEDIA_BOT_PASSWORD",') == []
    assert found("R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}") == []
    assert found('password: "${DB_PASSWORD}"') == []


def test_a_line_can_opt_out():
    assert found('token = "abcdef0123456789abcdef"  # scan-secrets: ignore') == []


def test_the_repository_itself_is_clean():
    assert scan.main([]) == 0


def test_history_mode_runs_clean_on_this_repository():
    assert scan.main(["--history"]) == 0


def test_history_mode_catches_a_secret_that_was_committed_and_then_deleted(tmp_path, monkeypatch, capsys):
    import subprocess

    def git(*args):
        subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@example.com", *args], cwd=tmp_path, check=True, capture_output=True)

    git("init", "-q")
    (tmp_path / "config.py").write_text('KEY = "AKIAABCDEFGHIJKLMNOP"\n')
    git("add", ".")
    git("commit", "-q", "-m", "oops")
    (tmp_path / "config.py").write_text("KEY = None\n")
    git("commit", "-q", "-am", "remove it")

    monkeypatch.setattr(scan, "ROOT", tmp_path)
    assert scan.main([]) == 0  # the current files are clean
    assert scan.main(["--history"]) == 1  # the history is not
    out = capsys.readouterr().out
    assert "config.py" in out and "AWS access key id" in out and "AKIAABCDEFGHIJKLMNOP" not in out
