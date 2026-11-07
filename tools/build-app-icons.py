"""
Baut alle App-Icons aus dem weißen L (assets/brand/lunaxora-l-white.png):

- assets/images/icon.png                 App-Icon iPhone/Mac (flach, schwarz – die Rundung macht das System)
- assets/images/favicon.png              Browser-Tab
- assets/images/splash-icon.png          Startbild beim Öffnen am Handy (L auf Schwarz)
- assets/images/android-icon-*.png       Android: Vordergrund, Einfarbig, Hintergrund

Größe des L wie in der Vorlage assets/brand/lunaxora-app-icon-mockup.png
(dort ist das L 44 % so hoch wie das Icon, mittig).

Aufruf:  python3 tools/build-app-icons.py
Benötigt: pillow, numpy
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MARK = ROOT / "assets/brand/lunaxora-l-white.png"
OUT = ROOT / "assets/images"

ICON_L_HEIGHT = 0.44  # Höhe des L im Verhältnis zum Icon (wie in der Vorlage)


def mark() -> Image.Image:
    img = Image.open(MARK).convert("RGBA")
    alpha = np.asarray(img.getchannel("A"))
    ys, xs = np.nonzero(alpha > 0)
    return img.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


def place(size: int, height_ratio: float, background: tuple[int, int, int, int]) -> Image.Image:
    """L mittig auf eine quadratische Fläche setzen."""
    letter = mark()
    h = round(size * height_ratio)
    w = round(letter.width * h / letter.height)
    letter = letter.resize((w, h), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), background)
    canvas.alpha_composite(letter, ((size - w) // 2, (size - h) // 2))
    return canvas


def main() -> None:
    black = (0, 0, 0, 255)
    clear = (0, 0, 0, 0)
    place(1024, ICON_L_HEIGHT, black).convert("RGB").save(OUT / "icon.png", optimize=True)
    # im Browser-Tab etwas größer, sonst ist das L winzig
    place(64, 0.53, black).convert("RGB").save(OUT / "favicon.png", optimize=True)
    place(1024, 0.67, clear).save(OUT / "splash-icon.png", optimize=True)
    # Android schneidet das Icon rund/eckig zu – das L bleibt im sicheren Bereich
    android = place(1024, 0.34, clear)
    android.save(OUT / "android-icon-foreground.png", optimize=True)
    android.save(OUT / "android-icon-monochrome.png", optimize=True)
    Image.new("RGB", (1024, 1024), (0, 0, 0)).save(OUT / "android-icon-background.png", optimize=True)
    print("Icons gespeichert in", OUT)


if __name__ == "__main__":
    main()
