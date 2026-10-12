"""Render a rounded-card flashcard illustration with actual word/translation faces."""

from pathlib import Path
import re
import subprocess

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen


ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
FONT = instantiateVariableFont(TTFont(ROOT / "fonts/Comfortaa-VariableFont_wght.ttf"), {"wght": 700}, inplace=False)
GLYPHS = FONT.getGlyphSet()
CMAP = FONT.getBestCmap()
METRICS = FONT["hmtx"]


def word_path(word: str, cx: float, cy: float, width: float, fill: str) -> str:
    cursor = 0
    elements = []
    bounds = []
    for char in word:
        name = CMAP[ord(char)]
        glyph = GLYPHS[name]
        pen = SVGPathPen(GLYPHS)
        glyph.draw(pen)
        bp = BoundsPen(GLYPHS)
        glyph.draw(bp)
        x0, y0, x1, y1 = bp.bounds
        bounds.append((cursor + x0, y0, cursor + x1, y1))
        elements.append(f'<path d="{pen.getCommands()}" transform="translate({cursor},0)"/>')
        cursor += METRICS[name][0]
    left = min(b[0] for b in bounds)
    bottom = min(b[1] for b in bounds)
    right = max(b[2] for b in bounds)
    top = max(b[3] for b in bounds)
    scale = width / (right - left)
    tx = cx - scale * (left + right) / 2
    ty = cy + scale * (bottom + top) / 2
    return f'<g fill="{fill}" transform="translate({tx:.3f},{ty:.3f}) scale({scale:.6f},{-scale:.6f})">{"".join(elements)}</g>'


svg = (OUT / "flashcards-mechanic-v4-900x750.svg").read_text(encoding="utf-8")
svg = re.sub(
    r'  <g transform="rotate\(15 503 356\)">.*?</g>\n',
    '',
    svg,
    count=1,
    flags=re.S,
)
svg = re.sub(
    r'<path d="M355 361.*?fill="#355CFF"/>',
    word_path("hello", 322, 418, 164, "#FFFFFF"),
    svg,
    count=1,
    flags=re.S,
)
svg = re.sub(
    r'<path d="M595 286.*?<path d="M554 449 H666".*?/>',
    word_path("привет", 605, 377, 213, "#192D86"),
    svg,
    count=1,
    flags=re.S,
)
svg = svg.replace('<!-- The visible face swings forward; its simple mark differs from the reverse. -->', '<!-- The visible face carries the translation in the project font. -->')

svg_file = OUT / "flashcards-mechanic-v5-900x750.svg"
png_file = OUT / "flashcards-mechanic-v5-900x750.png"
svg_file.write_text(svg, encoding="utf-8")
script = "const fs=require('fs');const sharp=require('sharp');sharp(fs.readFileSync(process.argv[1])).png().toFile(process.argv[2]).catch(e=>{console.error(e);process.exit(1)})"
subprocess.run(["node", "-e", script, str(svg_file), str(png_file)], cwd=ROOT, check=True)
print(png_file)
