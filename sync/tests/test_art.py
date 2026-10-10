import io

from PIL import Image

from lolsync.art import cache_art, card_list, to_webp

TS = '''
const CARDS: Record<string, Card> = {
  "Ahri": [5, "05IO004", "Ionia", 0.53, 0.37],
  "Kai'Sa": [6, "06SH009", "Shurima", 0.27, 0.25],
  "Jarvan IV": [1, "01DE022", "Demacia", 0.69, 0.14],
}
'''


def png(size=(64, 32), color=(200, 30, 30)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, "PNG")
    return out.getvalue()


def test_card_list_reads_every_champion_row_in_order():
    assert card_list(TS) == [(5, "05IO004"), (6, "06SH009"), (1, "01DE022")]


def test_to_webp_makes_a_smaller_webp_of_the_same_size():
    big = png((512, 256))
    webp = to_webp(big)
    image = Image.open(io.BytesIO(webp))
    assert image.format == "WEBP" and image.size == (512, 256)
    assert len(webp) < len(big)


def test_cache_art_saves_each_card_once_and_skips_those_it_has(tmp_path):
    urls = []

    def get(url):
        urls.append(url)
        return png()

    cards = card_list(TS)
    first = cache_art(cards, tmp_path, log=lambda _: None, get=get)
    assert first == {"saved": 3, "skipped": 0, "failed": 0}
    assert sorted(p.name for p in (tmp_path / "art").glob("*.webp")) == ["01DE022.webp", "05IO004.webp", "06SH009.webp"]
    assert urls[0] == "https://dd.b.pvp.net/latest/set5/en_us/img/cards/05IO004-full.png"

    urls.clear()
    again = cache_art(cards, tmp_path, log=lambda _: None, get=get)
    assert again == {"saved": 0, "skipped": 3, "failed": 0} and urls == []
    cache_art(cards, tmp_path, log=lambda _: None, get=get, redo=True)
    assert len(urls) == 3


def test_cache_art_keeps_going_when_one_card_fails(tmp_path):
    def get(url):
        if "06SH009" in url:
            raise OSError("404")
        return png()

    counts = cache_art(card_list(TS), tmp_path, log=lambda _: None, get=get)
    assert counts == {"saved": 2, "skipped": 0, "failed": 1}


def test_cache_art_limit_stops_after_that_many_new_files(tmp_path):
    counts = cache_art(card_list(TS), tmp_path, log=lambda _: None, get=lambda _u: png(), limit=1)
    assert counts["saved"] == 1
