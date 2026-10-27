import json
from pathlib import Path

ROOT = Path(__file__).parent
source = json.loads((ROOT / 'quality-pass-garble-8-target.json').read_text())

def row_of(word, translation):
    rows = [i for i, item in enumerate(source, 1) if item[:2] == [word, translation]]
    assert len(rows) == 1, (word, translation, rows)
    return rows[0]

edits = {
    row_of('ecologically', 'с экологической точки'): ('с экологической точки зрения', None),
    row_of('for good', 'наилучшим образом'): ('навсегда', 'C1'),
    row_of('off duty', 'в отпуске'): ('не на дежурстве', None),
    row_of('at a stretch', 'на одном дыхании'): ('без перерыва', None),
    row_of('to go by', 'о времени: проходить'): ('проходить (о времени)', None),
}
deletes = [
    row_of('importantly', 'с важным видом'),
    row_of('for good', 'в полном объёме'),
    row_of('on foot', 'на ногах'),
    row_of('in a sense', 'с одной стороны'),
]
changes = []
target = [r[:] for r in source]
for row, (translation, level) in edits.items():
    before = source[row - 1]
    after = before[:]
    after[1] = translation
    if level:
        after[3] = level
    changes.append({'row': row, 'before': before, 'after': after})
    target[row - 1] = after
removed = [{'row': row, 'before': source[row - 1]} for row in deletes]
for row in sorted(deletes, reverse=True):
    del target[row - 1]
seen = set()
for row in target[1:]:
    key = (row[0].casefold(), row[1].casefold(), row[2])
    assert key not in seen, key
    seen.add(key)
(ROOT / 'quality-pass-idioms-9-plan.json').write_text(json.dumps({'edits': changes, 'deletes': removed}, ensure_ascii=False))
(ROOT / 'quality-pass-idioms-9-target.json').write_text(json.dumps(target, ensure_ascii=False))
print('edits', len(changes), 'deletes', len(deletes), 'rows', len(target)-1, 'unique', len({r[0].casefold() for r in target[1:]}))
