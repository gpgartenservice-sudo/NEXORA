"""
Schneidet die einzelnen Buchstaben L U N A X O R A aus dem weißen Schriftzug
(assets/brand/lunaxora-wordmark-white.png) aus, damit die Start-Animation sie
einzeln bewegen kann.

- Jeder Buchstabe wird als eigene, transparente PNG gespeichert
  (assets/images/logo/letter-*.png, das zweite A als letter-a2.png). Alle
  Buchstaben haben dieselbe Höhe, dadurch bleibt die Grundlinie exakt wie im
  Original.
- Im Schriftzug berühren sich A und X sowie R und A unten an einer Ecke. Das
  Skript trennt sie dort: Es schrumpft die Formen, bis sie auseinanderfallen,
  und ordnet danach jedes Pixel dem nächstgelegenen Buchstaben zu.
- Die Pixel bleiben exakt wie im Original (nur die Farbe wird auf reines
  Weiß gesetzt).
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
SOURCE = ROOT / "assets/brand/lunaxora-wordmark-white.png"
OUT_DIR = ROOT / "assets/images/logo"
LAYOUT_FILE = ROOT / "src/components/brand/letter-layout.ts"

# (Schlüssel im Code, Dateiname) – das zweite A braucht einen eigenen Schlüssel
LETTERS = [("L", "l"), ("U", "u"), ("N", "n"), ("A", "a"), ("X", "x"), ("O", "o"), ("R", "r"), ("A2", "a2")]
PAD = 3            # Rand um jeden Buchstaben (Originalpixel)
ALPHA_MIN = 30     # ab hier zählt ein Pixel zur Form
MIN_PART = 500     # kleinere Flächen sind Staub/Artefakte


def parts_of(mask: np.ndarray) -> tuple[np.ndarray, list[int]]:
    labels, count = ndimage.label(mask)
    sizes = ndimage.sum(np.ones(mask.shape), labels, range(1, count + 1))
    return labels, [i + 1 for i, s in enumerate(sizes) if s >= MIN_PART]


def group_parts(labels: np.ndarray, keep: list[int]) -> list[list[dict]]:
    """Flächen per horizontaler Lage zu Buchstaben gruppieren: Eine Fläche gehört
    zum bisherigen Buchstaben, wenn ihre Mitte links von dessen Ende liegt
    (so landen z. B. der rechte Strich des N und der Fuß im A beim richtigen
    Buchstaben)."""
    parts = []
    for idx in keep:
        xs = np.nonzero((labels == idx).any(axis=0))[0]
        parts.append({"label": idx, "x0": int(xs.min()), "x1": int(xs.max()) + 1, "cx": (xs.min() + xs.max() + 1) / 2})
    parts.sort(key=lambda p: p["cx"])
    groups: list[list[dict]] = []
    for part in parts:
        if groups and part["cx"] < max(p["x1"] for p in groups[-1]):
            groups[-1].append(part)
        else:
            groups.append([part])
    return groups


def main() -> None:
    img = Image.open(SOURCE).convert("RGBA")
    alpha = np.asarray(img.getchannel("A")).astype(np.float32) / 255.0
    shape = alpha > ALPHA_MIN / 255.0

    # Formen schrumpfen, bis jeder Buchstabe für sich steht (Berührungspunkte lösen sich).
    # Nur die Anzahl reicht nicht: Ein abgetrennter Fuß im A plus ein noch
    # zusammenhängendes A+X ergäbe zufällig auch 8. Daher müssen alle Buchstaben
    # ungefähr gleich breit sein.
    def plausible(groups: list[list[dict]]) -> bool:
        if len(groups) != len(LETTERS):
            return False
        widths = [max(p["x1"] for p in g) - min(p["x0"] for p in g) for g in groups]
        return min(widths) > 0.5 * float(np.median(widths)) and max(widths) < 1.6 * float(np.median(widths))

    for shrink in range(0, 16):
        core = ndimage.binary_erosion(shape, iterations=shrink) if shrink else shape
        labels, keep = parts_of(core)
        groups = group_parts(labels, keep)
        if plausible(groups):
            break
    else:
        raise SystemExit(f"Erwartet {len(LETTERS)} Buchstaben, gefunden {len(groups)}")

    # Jedes Pixel dem nächstgelegenen geschrumpften Teil zuordnen -> saubere Trennung
    letter_of_label = np.zeros(labels.max() + 1, dtype=np.int32)  # 0 = kein Buchstabe
    for n, group in enumerate(groups, start=1):
        for p in group:
            letter_of_label[p["label"]] = n
    seeds = letter_of_label[labels]
    _, (iy, ix) = ndimage.distance_transform_edt(seeds == 0, return_indices=True)
    nearest = seeds[iy, ix]
    near_shape = ndimage.binary_dilation(shape, iterations=PAD)  # weiche Kantenpixel mitnehmen

    ys, xs = np.nonzero(shape)
    top, bottom = int(ys.min()) - PAD, int(ys.max()) + 1 + PAD
    left, right = int(xs.min()) - PAD, int(xs.max()) + 1 + PAD
    word_w, word_h = right - left, bottom - top

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("letter-*.png"):
        old.unlink()
    layout = []
    for n, ((key, file), group) in enumerate(zip(LETTERS, groups), start=1):
        mask = (nearest == n) & near_shape
        cols = np.nonzero(mask.any(axis=0))[0]
        x0, x1 = int(cols.min()), int(cols.max()) + 1
        a = np.where(mask, alpha, 0.0)[top:bottom, x0:x1]
        rgba = np.zeros((*a.shape, 4), dtype=np.uint8)
        rgba[..., :3] = 255
        rgba[..., 3] = (np.clip(a, 0.0, 1.0) * 255).round().astype(np.uint8)
        Image.fromarray(rgba).save(OUT_DIR / f"letter-{file}.png", optimize=True)
        layout.append((key, (x0 - left) / word_w, (x1 - x0) / word_w))

    lines = [
        "// Automatisch erzeugt von tools/build-logo-letters.py – nicht von Hand ändern.",
        "// Position und Breite jedes Buchstabens als Anteil an der Gesamtbreite des Schriftzugs.",
        "",
        f"export const WORDMARK_ASPECT_RATIO = {word_w / word_h:.5f}; // Breite / Höhe",
        "",
        "export const LETTER_LAYOUT = [",
    ]
    for key, x, w in layout:
        lines.append(f"  {{ key: '{key}', x: {x:.5f}, width: {w:.5f} }},")
    lines += ["] as const;", "", "export type LetterKey = (typeof LETTER_LAYOUT)[number]['key'];", ""]
    LAYOUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    LAYOUT_FILE.write_text("\n".join(lines), encoding="utf-8")

    print(f"Schriftzug {word_w}x{word_h} px, {len(layout)} Buchstaben (getrennt nach {shrink} px Schrumpfen) in {OUT_DIR}")
    for key, x, w in layout:
        print(f"  {key}: x={x:.3f} breite={w:.3f}")


if __name__ == "__main__":
    main()
