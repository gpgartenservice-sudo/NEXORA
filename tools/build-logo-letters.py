"""
Schneidet die einzelnen Buchstaben N E X O R A aus dem weißen Schriftzug
(assets/brand/nexora-wordmark-white.png) aus, damit die Start-Animation sie
einzeln bewegen kann.

- Jeder Buchstabe wird als eigene, transparente PNG gespeichert
  (assets/images/logo/letter-*.png). Alle Buchstaben haben dieselbe Höhe,
  dadurch bleibt die Grundlinie exakt wie im Original.
- Die Pixel bleiben exakt wie im Original (nur die Farbe wird auf reines
  Weiß gesetzt). Die Auflösung (ca. 1700 px Breite) reicht für einen
  Schriftzug bis ca. 850 pt Breite auf Retina-Bildschirmen. Für größere
  Darstellungen später auf eine SVG-Version umsteigen.
- Die Positionen (relativ zum Schriftzug) landen in
  src/components/brand/letter-layout.ts.

Aufruf:  python3 tools/build-logo-letters.py
Benötigt: pillow, numpy, scipy
"""

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets/brand/nexora-wordmark-white.png"
OUT_DIR = ROOT / "assets/images/logo"
LAYOUT_FILE = ROOT / "src/components/brand/letter-layout.ts"

LETTERS = ["N", "E", "X", "O", "R", "A"]
PAD = 3            # Rand um jeden Buchstaben (Originalpixel)
ALPHA_MIN = 30     # ab hier zählt ein Pixel zur Form


def main() -> None:
    img = Image.open(SOURCE).convert("RGBA")
    alpha = np.asarray(img.getchannel("A")).astype(np.float32) / 255.0

    # Zusammenhängende Flächen finden (das E besteht z. B. aus 3 Balken)
    labels, _ = ndimage.label(alpha > ALPHA_MIN / 255.0)
    objects = ndimage.find_objects(labels)
    parts = []
    for idx, sl in enumerate(objects, start=1):
        if sl is None or (labels[sl] == idx).sum() < 500:
            continue  # Staub/Artefakte ignorieren
        x0, x1 = sl[1].start, sl[1].stop
        parts.append({"label": idx, "x0": x0, "x1": x1, "cx": (x0 + x1) / 2})

    # Flächen per horizontaler Lücke zu Buchstaben gruppieren. R und A
    # überlappen sich horizontal leicht, daher über die Mitte zuordnen:
    # eine Fläche gehört zu einem neuen Buchstaben, wenn ihre Mitte rechts
    # vom Ende des bisherigen Buchstabens liegt.
    parts.sort(key=lambda p: p["cx"])
    groups: list[list[dict]] = []
    for part in parts:
        if groups and part["cx"] < max(p["x1"] for p in groups[-1]):
            groups[-1].append(part)
        else:
            groups.append([part])
    if len(groups) != len(LETTERS):
        raise SystemExit(f"Erwartet {len(LETTERS)} Buchstaben, gefunden {len(groups)}")

    ys, xs = np.nonzero(alpha > ALPHA_MIN / 255.0)
    top, bottom = int(ys.min()) - PAD, int(ys.max()) + 1 + PAD
    left, right = int(xs.min()) - PAD, int(xs.max()) + 1 + PAD
    word_w, word_h = right - left, bottom - top

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    layout = []
    for letter, group in zip(LETTERS, groups):
        mask = np.isin(labels, [p["label"] for p in group])
        # weiche Kantenpixel (unterhalb der Schwelle) mitnehmen
        mask = ndimage.binary_dilation(mask, iterations=PAD)
        x0 = min(p["x0"] for p in group) - PAD
        x1 = max(p["x1"] for p in group) + PAD
        a = np.where(mask, alpha, 0.0)[top:bottom, x0:x1]

        # Das Original ist zu 99,6 % deckend (Alpha 254) -> auf 100 % ziehen
        a = np.clip(a * 255.0 / 254.0, 0.0, 1.0)
        rgba = np.zeros((*a.shape, 4), dtype=np.uint8)
        rgba[..., :3] = 255
        rgba[..., 3] = (a * 255).round().astype(np.uint8)
        Image.fromarray(rgba, "RGBA").save(OUT_DIR / f"letter-{letter.lower()}.png", optimize=True)

        layout.append((letter, (x0 - left) / word_w, (x1 - x0) / word_w))

    lines = [
        "// Automatisch erzeugt von tools/build-logo-letters.py – nicht von Hand ändern.",
        "// Position und Breite jedes Buchstabens als Anteil an der Gesamtbreite des Schriftzugs.",
        "",
        f"export const WORDMARK_ASPECT_RATIO = {word_w / word_h:.5f}; // Breite / Höhe",
        "",
        "export const LETTER_LAYOUT = [",
    ]
    for letter, x, w in layout:
        lines.append(f"  {{ key: '{letter}', x: {x:.5f}, width: {w:.5f} }},")
    lines += ["] as const;", "", "export type LetterKey = (typeof LETTER_LAYOUT)[number]['key'];", ""]
    LAYOUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    LAYOUT_FILE.write_text("\n".join(lines), encoding="utf-8")

    print(f"Schriftzug {word_w}x{word_h} px, {len(layout)} Buchstaben gespeichert in {OUT_DIR}")
    for letter, x, w in layout:
        print(f"  {letter}: x={x:.3f} breite={w:.3f}")


if __name__ == "__main__":
    main()
