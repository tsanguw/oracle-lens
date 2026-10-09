from lolsync.r2 import upload_images


class FakeClient:
    def __init__(self, keys):
        self.keys = keys
        self.puts = []

    def get_paginator(self, name):
        assert name == "list_objects_v2"
        outer = self

        class P:
            def paginate(self, Bucket, Prefix):
                yield {"Contents": [{"Key": k} for k in outer.keys if k.startswith(Prefix)]}

        return P()

    def put_object(self, **kw):
        self.puts.append(kw)


def test_only_missing_files_are_uploaded_with_long_cache(tmp_path):
    (tmp_path / "teams").mkdir()
    (tmp_path / "players").mkdir()
    (tmp_path / "teams" / "t1-aaaaaa.webp").write_bytes(b"1")
    (tmp_path / "teams" / "gen-bbbbbb.webp").write_bytes(b"2")
    (tmp_path / "players" / "faker-cccccc.webp").write_bytes(b"3")
    client = FakeClient({"teams/t1-aaaaaa.webp"})
    counts = upload_images(client, "bucket", tmp_path, log=lambda m: None)
    assert counts == {"uploaded": 2, "skipped": 1}
    assert {p["Key"] for p in client.puts} == {"teams/gen-bbbbbb.webp", "players/faker-cccccc.webp"}
    assert all(p["ContentType"] == "image/webp" and "immutable" in p["CacheControl"] for p in client.puts)
