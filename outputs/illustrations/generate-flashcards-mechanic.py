"""Create the flashcard mechanic illustration in the project's flat style."""

from pathlib import Path
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


def word_path(word: str, center_x: float, center_y: float, width: float, fill: str) -> str:
    cursor = 0
    paths = []
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
        paths.append(f'<path d="{pen.getCommands()}" transform="translate({cursor},0)"/>')
        cursor += METRICS[name][0]
    left, bottom = min(b[0] for b in bounds), min(b[1] for b in bounds)
    right, top = max(b[2] for b in bounds), max(b[3] for b in bounds)
    scale = width / (right - left)
    tx = center_x - scale * (left + right) / 2
    ty = center_y + scale * (bottom + top) / 2
    return f'<g fill="{fill}" transform="translate({tx:.3f},{ty:.3f}) scale({scale:.6f},{-scale:.6f})">{"".join(paths)}</g>'


svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="900" height="750" viewBox="0 0 900 750">
  <rect width="900" height="750" fill="#EEF2FF"/>
  <!-- One broad motion arc makes the flip readable at small sizes. -->
  <path d="M230 244 C286 131 411 94 536 111 C622 123 688 175 712 230" fill="none" stroke="#A27AF5" stroke-width="25" stroke-linecap="round"/>

  <!-- Word side of the card, with a single deep-blue thickness plane. -->
  <g transform="rotate(-14 336 377)">
    <rect x="183" y="211" width="318" height="348" fill="#2039B4"/>
    <rect x="167" y="193" width="318" height="348" fill="#355CFF"/>
    {word_path('CAT', 315, 347, 197, '#FFFFFF')}
    <path d="M230 410 H375" stroke="#BFCFFF" stroke-width="13" stroke-linecap="round"/>
    <path d="M230 447 H343" stroke="#BFCFFF" stroke-width="13" stroke-linecap="round"/>
  </g>

  <!-- Picture side: clean white paper and one friendly animal silhouette. -->
  <g transform="rotate(10 565 382)">
    <rect x="411" y="208" width="321" height="354" fill="#2039B4"/>
    <rect x="394" y="190" width="321" height="354" fill="#FFFFFF"/>
    <path fill="#FFD43B" d="M465 329 L476 250 Q479 237 491 246 L514 271 Q558 255 600 272 L627 247 Q639 237 643 251 L655 328 Q666 381 634 411 Q605 438 560 438 Q515 438 486 411 Q454 381 465 329 Z"/>
    <path fill="#FF943D" d="M483 272 L488 255 L510 278 Z"/>
    <path fill="#FF943D" d="M613 278 L635 255 L640 273 Z"/>
    <ellipse cx="524" cy="348" rx="8" ry="11" fill="#192D86"/>
    <ellipse cx="598" cy="348" rx="8" ry="11" fill="#192D86"/>
    <path d="M553 376 Q561 385 569 376 Z" fill="#D9940B"/>
    <path d="M561 383 V391 M561 391 Q550 402 541 394 M561 391 Q572 402 581 394" fill="none" stroke="#D9940B" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M506 470 H620" stroke="#BFCFFF" stroke-width="13" stroke-linecap="round"/>
  </g>
  <path d="M678 211 L720 260 L739 198 Z" fill="#A27AF5"/>
</svg>'''

SVG = OUT / "flashcards-mechanic-900x750.svg"
PNG = OUT / "flashcards-mechanic-900x750.png"
SVG.write_text(svg, encoding="utf-8")
script = "const fs=require('fs');const sharp=require('sharp');sharp(fs.readFileSync(process.argv[1])).png().toFile(process.argv[2]).catch(e=>{console.error(e);process.exit(1)})"
subprocess.run(["node", "-e", script, str(SVG), str(PNG)], cwd=ROOT, check=True)
print(PNG)
