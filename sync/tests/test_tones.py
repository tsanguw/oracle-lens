from PIL import Image, ImageDraw

from lolsync.tones import logo_tone


def shape(fill, backdrop=(0, 0, 0, 0), size=64):
    img = Image.new("RGBA", (size, size), backdrop)
    ImageDraw.Draw(img).ellipse((12, 12, size - 12, size - 12), fill=fill)
    return img


def test_black_artwork_on_a_transparent_background_needs_a_light_plate():
    assert logo_tone(shape((0, 0, 0, 255))) == "dark"
    assert logo_tone(shape((15, 15, 25, 255))) == "dark"


def test_white_artwork_is_fine_on_the_dark_panel():
    assert logo_tone(shape((255, 255, 255, 255))) == "light"


def test_mid_tone_artwork_is_left_alone():
    assert logo_tone(shape((0, 120, 220, 255))) == "neutral"  # blue is readable on both the dark panel and the plate
    assert logo_tone(shape((200, 40, 40, 255))) == "neutral"  # red


def test_gold_artwork_stays_on_the_dark_panel():
    # Bright gold is easy to see on the dark panel but washes out on a light plate, so it must not get one.
    assert logo_tone(shape((240, 180, 41, 255))) == "light"


def test_a_logo_that_brings_its_own_backdrop_needs_nothing():
    # Black square filling the frame: opaque, so the plate would only add a border.
    assert logo_tone(Image.new("RGBA", (64, 64), (0, 0, 0, 255))) == "neutral"


def test_an_empty_image_is_neutral():
    assert logo_tone(Image.new("RGBA", (32, 32), (0, 0, 0, 0))) == "neutral"
