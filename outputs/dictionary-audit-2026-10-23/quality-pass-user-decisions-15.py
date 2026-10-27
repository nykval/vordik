import json
from pathlib import Path

ROOT = Path(__file__).parent
source = json.loads((ROOT / 'quality-pass-pronouns-14-target.json').read_text())

def row_of(word, translation):
    rows = [i for i, item in enumerate(source, 1) if item[:2] == [word, translation]]
    assert len(rows) == 1, (word, translation, rows)
    return rows[0]


changes = {
    ('bailee', 'лицо, принявшее имущество на хранение'):
        ['bailee', 'хранитель', 'существительное', 'C2', 'Право'],
    ('school pence', 'еженедельный взнос на учение в начальной школе'):
        ['school pence', 'плата за обучение в школе', 'существительное', 'C2', 'История и общество'],
    ('cavity magnetron', 'магнетрон, обеспечивающий большой выход энергии'):
        ['cavity magnetron', 'многорезонаторный магнетрон', 'существительное', 'C2', 'Физика и астрономия'],
    ('ghostwriter', 'автор, пишущий под чужим именем'):
        ['ghostwriter', 'гострайтер', 'существительное', 'C1', 'Работа'],
    ('to boondoggle', 'впустую тратить'):
        ['to boondoggle', 'тратить время впустую', 'глагол', 'C2', ''],
}
deletes = [
    row_of('to boondoggle', 'терять время (на бесцельную, пустую деятельность)'),
    row_of('to run back', 'восходить (к определенному периоду)'),
]
adds = [['ghostwriter', 'автор-призрак', 'существительное', 'C1', 'Работа']]
edits = []
target = [r[:] for r in source]
for (word, old), after in changes.items():
    row = row_of(word, old)
    before = source[row - 1]
    edits.append({'row': row, 'before': before, 'after': after})
    target[row - 1] = after
removed = [{'row': row, 'before': source[row - 1]} for row in deletes]
for row in sorted(deletes, reverse=True):
    del target[row - 1]
target.extend(adds)
seen = set()
for row in target[1:]:
    key = (row[0].casefold(), row[1].casefold(), row[2])
    assert key not in seen, key
    seen.add(key)
assert len(target) == len(source) - len(deletes) + len(adds)
(ROOT / 'quality-pass-user-decisions-15-plan.json').write_text(json.dumps({'edits': edits, 'deletes': removed, 'adds': adds}, ensure_ascii=False))
(ROOT / 'quality-pass-user-decisions-15-target.json').write_text(json.dumps(target, ensure_ascii=False))
print('edits', len(edits), 'deletes', len(deletes), 'adds', len(adds), 'rows', len(target)-1, 'unique', len({r[0].casefold() for r in target[1:]}))
