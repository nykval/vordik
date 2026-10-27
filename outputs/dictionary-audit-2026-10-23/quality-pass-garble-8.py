import json
from pathlib import Path

ROOT = Path(__file__).parent
source = json.loads((ROOT / 'quality-pass-phrasal-precise-7-target.json').read_text())
def row_of(word, translation):
    rows = [i for i, item in enumerate(source, 1) if item[:2] == [word, translation]]
    assert len(rows) == 1, (word, translation, rows)
    return rows[0]


edits = {
    row_of('anhydrous', 'безводный (не содержащий в своем составе воды)'): 'безводный',
    row_of('ferrite', 'ферромагнитный керамический материал'): 'феррит',
    row_of('hovercraft', 'судно'): 'судно на воздушной подушке',
    row_of('is it safe here', 'здесь он в безопасности?'): 'здесь безопасно?',
    row_of('percutaneous', 'подкожный (о впрыскивании и т. п.)'): 'чрескожный',
    row_of('to shelve', 'о проектах'): 'откладывать',
    row_of('to shelve', 'идеях и т. п. прекращать'): 'ставить на полку',
    row_of('what day is it today', 'какое сегодня число?'): 'какой сегодня день?',
}
deletes = [
    row_of('ferrite', 'помимо: фазовая составляющая сплавов железа'),
    row_of('hovercraft', 'поезд и т. п. на воздушной подушке'),
    row_of('to shelve', 'отказываться'),
]
changes = []
target = [r[:] for r in source]
for row, translation in edits.items():
    before = source[row - 1]
    after = [before[0], translation, *before[2:]]
    changes.append({'row': row, 'before': before, 'after': after})
    target[row - 1] = after
removed = [{'row': row, 'before': source[row - 1]} for row in deletes]
for row in sorted(deletes, reverse=True):
    del target[row - 1]
assert len(target) == len(source) - len(deletes)
seen = set()
for row in target[1:]:
    key = (row[0].casefold(), row[1].casefold(), row[2])
    assert key not in seen, key
    seen.add(key)
(ROOT / 'quality-pass-garble-8-plan.json').write_text(json.dumps({'edits': changes, 'deletes': removed}, ensure_ascii=False))
(ROOT / 'quality-pass-garble-8-target.json').write_text(json.dumps(target, ensure_ascii=False))
print('edits', len(changes), 'deletes', len(deletes), 'rows', len(target)-1, 'unique', len({r[0].casefold() for r in target[1:]}))
for item in changes + removed:
    print(item['row'], item['before'][:2], '->', item.get('after', ['DELETE'])[:2])
