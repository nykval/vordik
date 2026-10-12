"""Single knowledge badge following the small user supplied template."""

from pathlib import Path
import re
import subprocess

from generate import make_svg, number_svg


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]

svg = make_svg(2)
svg = svg.replace('fill="#EEF2FF"', 'fill="#FFFFFF"', 1)
svg = svg.replace('<circle cx="350" cy="326" r="76" fill="#2039B4"/>', '')

folds = '''<g fill="none" stroke="#B93579" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">
    <path d="M279 153 C264 165 268 183 283 190 C300 199 298 215 284 225"/>
    <path d="M421 155 C435 165 430 183 416 190 C402 198 405 213 419 222"/>
    <path d="M230 295 C252 283 271 290 277 307 C282 321 270 336 253 338"/>
    <path d="M468 297 C446 284 427 291 422 307 C418 323 428 335 446 339"/>
    <path d="M351 341 C347 357 352 374 350 387"/>
  </g>'''
svg = re.sub(r'<g fill="none" stroke="#B93579".*?</g>', folds, svg, count=1, flags=re.S)

small_number = number_svg(2)
large_number = small_number.replace(
    'fill="#FFFFFF"',
    'fill="#192D86" stroke="#FFFFFF" stroke-width="31" stroke-linejoin="round" paint-order="stroke"',
)
large_number = f'<g transform="translate(350 260) scale(1.65) translate(-350 -326)">{large_number}</g>'
svg = svg.replace(small_number, large_number)

svg_path = HERE / 'knowledge-02-template.svg'
png_path = HERE / 'knowledge-02-template.png'
svg_path.write_text(svg, encoding='utf-8')
script = "const fs=require('fs');const sharp=require('sharp');sharp(fs.readFileSync(process.argv[1])).png().toFile(process.argv[2]).catch(e=>{console.error(e);process.exit(1)})"
subprocess.run(['node', '-e', script, str(svg_path), str(png_path)], cwd=ROOT, check=True)
print(png_path)
