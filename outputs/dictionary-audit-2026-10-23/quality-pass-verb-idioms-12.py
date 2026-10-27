import json
from pathlib import Path

ROOT = Path(__file__).parent
source = json.loads((ROOT / 'quality-pass-verbs-11-target.json').read_text())

def row_of(word, translation):
    rows = [i for i, item in enumerate(source, 1) if item[:2] == [word, translation]]
    assert len(rows) == 1, (word, translation, rows)
    return rows[0]


changes = {
    ('to get nowhere', 'ни к чему не приводит'): 'не добиваться результата',
    ('to get nowhere', 'никуда не ведет'): 'не продвигаться',
    ('to go nowhere', 'никуда не идти'): 'не иметь перспектив',
    ('to eke out', 'едва сводить концы'): 'экономно расходовать',
    ('to eke out', 'выжимать'): 'едва сводить концы с концами',
}
edits = []
target = [r[:] for r in source]
for (word, old), translation in changes.items():
    row = row_of(word, old)
    before = source[row - 1]
    after = before[:]
    after[1] = translation
    if word == 'to eke out':
        after[2] = 'фразовый глагол'
    edits.append({'row': row, 'before': before, 'after': after})
    target[row - 1] = after
row = row_of('to eke out', 'с трудом добывать')
before = source[row - 1]
after = before[:]
after[2] = 'фразовый глагол'
edits.append({'row': row, 'before': before, 'after': after})
target[row - 1] = after
seen = set()
for row in target[1:]:
    key = (row[0].casefold(), row[1].casefold(), row[2])
    assert key not in seen, key
    seen.add(key)
(ROOT / 'quality-pass-verb-idioms-12-plan.json').write_text(json.dumps({'edits': edits}, ensure_ascii=False))
(ROOT / 'quality-pass-verb-idioms-12-target.json').write_text(json.dumps(target, ensure_ascii=False))
print('edits', len(edits), 'rows', len(target)-1, 'unique', len({r[0].casefold() for r in target[1:]}))
