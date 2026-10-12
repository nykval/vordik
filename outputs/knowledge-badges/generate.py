"""Build the ten knowledge illustrations from the project palette and font."""

from pathlib import Path
import subprocess

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen


ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
FONT_PATH = ROOT / "fonts/Comfortaa-VariableFont_wght.ttf"

font = instantiateVariableFont(TTFont(FONT_PATH), {"wght": 700}, inplace=False)
glyph_set = font.getGlyphSet()
cmap = font.getBestCmap()
hmtx = font["hmtx"]


def number_svg(value: int) -> str:
    chars = str(value)
    x_cursor = 0
    pieces = []
    all_bounds = []
    for char in chars:
        name = cmap[ord(char)]
        glyph = glyph_set[name]
        pen = SVGPathPen(glyph_set)
        glyph.draw(pen)
        bounds_pen = BoundsPen(glyph_set)
        glyph.draw(bounds_pen)
        x0, y0, x1, y1 = bounds_pen.bounds
        all_bounds.append((x_cursor + x0, y0, x_cursor + x1, y1))
        pieces.append(f'<path d="{pen.getCommands()}" transform="translate({x_cursor},0)"/>')
        x_cursor += hmtx[name][0]

    x0 = min(b[0] for b in all_bounds)
    y0 = min(b[1] for b in all_bounds)
    x1 = max(b[2] for b in all_bounds)
    y1 = max(b[3] for b in all_bounds)
    # Keep a common numeral height; the two-digit value is slightly smaller to breathe.
    target_height = 98 if value < 10 else 88
    scale = target_height / (y1 - y0)
    tx = 350 - scale * (x0 + x1) / 2
    ty = 326 + scale * (y0 + y1) / 2
    return f'<g fill="#FFFFFF" transform="translate({tx:.3f},{ty:.3f}) scale({scale:.6f},{-scale:.6f})">{"".join(pieces)}</g>'


def make_svg(value: int) -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="700" height="525" viewBox="0 0 700 525">
  <rect width="700" height="525" fill="#EEF2FF"/>
  <g transform="translate(350 265) scale(1.18) translate(-350 -265)">
  <!-- A single cut-paper brain silhouette with two broad colored planes. -->
  <path fill="#F66FB1" d="M350 145 C337 117 312 105 283 111 C257 108 231 126 223 151 C193 149 170 171 173 201 C147 216 145 248 166 272 C150 300 163 333 193 345 C190 375 211 395 240 394 C257 421 300 424 329 402 C340 410 359 410 371 402 C399 425 440 420 457 392 C486 394 507 373 506 344 C536 328 539 296 520 271 C539 248 531 214 505 200 C507 170 485 148 457 149 C447 123 422 107 393 111 C374 112 359 125 350 145 Z"/>
  <path fill="#FFD0E8" d="M332 152 C318 132 294 129 277 141 C251 137 235 155 237 176 C208 173 191 193 199 215 C178 233 183 255 205 266 C189 287 195 314 219 319 C213 343 229 359 250 358 C255 384 297 390 325 371 C340 359 339 328 339 291 C339 242 339 174 332 152 Z"/>
  <path fill="#FFD0E8" d="M367 151 C383 129 408 130 423 141 C449 138 466 158 461 178 C490 176 506 195 498 218 C521 234 516 258 493 268 C511 290 505 316 482 321 C489 342 473 361 449 359 C442 386 401 390 375 371 C359 358 361 328 360 287 C359 230 360 174 367 151 Z"/>
  <!-- Broad, rounded folds; each line is a color plane rather than an outline. -->
  <g fill="none" stroke="#B93579" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">
    <path d="M279 153 C264 165 268 183 283 190 C300 199 298 215 284 225"/>
    <path d="M209 217 C230 215 245 228 243 244 C241 258 228 263 214 263"/>
    <path d="M230 295 C252 283 271 290 277 307 C282 321 270 336 253 338"/>
    <path d="M305 285 C315 269 309 255 296 247"/>
    <path d="M421 155 C435 165 430 183 416 190 C402 198 405 213 419 222"/>
    <path d="M491 215 C470 215 455 229 457 246 C459 258 471 266 487 267"/>
    <path d="M468 297 C446 284 427 291 422 307 C418 323 428 335 446 339"/>
    <path d="M394 286 C383 272 390 254 405 246"/>
    <path d="M350 167 C343 201 355 228 349 263"/>
  </g>
  <!-- Number tab is deliberately simple and identical in all ten files. -->
  <circle cx="350" cy="326" r="76" fill="#2039B4"/>
  {number_svg(value)}
  </g>
</svg>'''


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for value in range(1, 11):
        stem = f"knowledge-{value:02}"
        (OUT / f"{stem}.svg").write_text(make_svg(value), encoding="utf-8")
    script = '''const fs=require('fs'); const sharp=require('sharp'); const path=require('path');
const dir=process.argv[1]; Promise.all(Array.from({length:10},(_,i)=>{
 const stem=`knowledge-${String(i+1).padStart(2,'0')}`;
 return sharp(fs.readFileSync(path.join(dir,stem+'.svg'))).png().toFile(path.join(dir,stem+'.png'));
})).then(()=>console.log('Rendered 10 PNGs')).catch(e=>{console.error(e);process.exit(1)});'''
    subprocess.run(["node", "-e", script, str(OUT)], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
