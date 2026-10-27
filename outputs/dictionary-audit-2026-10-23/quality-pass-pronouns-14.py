import json
from pathlib import Path

ROOT = Path(__file__).parent
source = json.loads((ROOT / 'quality-pass-function-verb-13-target.json').read_text())

def row_of(word, translation, typ):
    rows = [i for i, item in enumerate(source, 1)
            if item[:3] == [word, translation, typ]]
    assert len(rows) == 1, (word, translation, typ, rows)
    return rows[0]


changes = {
    ('most', 'самый', 'местоимение'): 'большинство',
    ('most', 'самого', 'местоимение'): 'большая часть',
    ('plenty', 'многие', 'местоимение'): 'много',
    ('little', 'немногий', 'местоимение'): 'немногое',
    ('few', 'несколько', 'местоимение'): 'немногие',
}
edits = []
target = [r[:] for r in source]
for (word, old, typ), new in changes.items():
    row = row_of(word, old, typ)
    before = source[row - 1]
    after = before[:]
    after[1] = new
    edits.append({'row': row, 'before': before, 'after': after})
    target[row - 1] = after
seen = set()
for row in target[1:]:
    key = (row[0].casefold(), row[1].casefold(), row[2])
    assert key not in seen, key
    seen.add(key)
(ROOT / 'quality-pass-pronouns-14-plan.json').write_text(json.dumps({'edits': edits}, ensure_ascii=False))
(ROOT / 'quality-pass-pronouns-14-target.json').write_text(json.dumps(target, ensure_ascii=False))
print('edits', len(edits), 'rows', len(target)-1, 'unique', len({r[0].casefold() for r in target[1:]}))
