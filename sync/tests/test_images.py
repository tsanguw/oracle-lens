import io

from PIL import Image

from lolsync.images import _normalize, file_name, image_infos, to_webp


def png(width: int, height: int) -> bytes:
    out = io.BytesIO()
    Image.new("RGBA", (width, height), (240, 180, 41, 255)).save(out, format="PNG")
    return out.getvalue()


def test_file_names_are_stable_url_safe_and_do_not_collide():
    assert file_name("T1") == file_name("T1")
    assert file_name("Gen.G").endswith(".webp") and " " not in file_name("Gen.G Esports (Korea)")
    # Names that slug to the same text still get different files.
    assert file_name("Pain Gaming") != file_name("paiN Gaming")
    assert file_name("!!!").startswith("image-")


def test_images_are_shrunk_to_fit_and_encoded_as_webp():
    big = to_webp(png(5000, 2500), 128)
    img = Image.open(io.BytesIO(big))
    assert img.format == "WEBP" and img.size == (128, 64)  # aspect ratio kept
    small = Image.open(io.BytesIO(to_webp(png(40, 30), 128)))
    assert small.size == (40, 30)  # never enlarged


def test_file_titles_are_normalised_like_mediawiki():
    assert _normalize("t1logo_profile.png") == "T1logo profile.png"
    assert _normalize(" Gen.Glogo square.png ") == "Gen.Glogo square.png"


class FakeSite:
    def __init__(self, pages):
        self.pages = pages
        self.requests = []

    def api(self, action, **params):
        self.requests.append(params["titles"].split("|"))
        return {"query": {"pages": self.pages}}


class FakeLp:
    def __init__(self, pages):
        self.site = FakeSite(pages)


def test_image_infos_maps_back_by_normalised_title_and_skips_missing_files():
    pages = {
        "1": {"title": "File:T1logo profile.png", "imageinfo": [{"url": "https://cdn/x.png", "sha1": "abc"}]},
        "-1": {"title": "File:Nope.png", "missing": ""},
    }
    infos = image_infos(FakeLp(pages), ["t1logo_profile.png", "Nope.png"])
    assert infos == {"T1logo profile.png": {"url": "https://cdn/x.png", "sha1": "abc"}}
