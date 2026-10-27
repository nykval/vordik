import json
from pathlib import Path

ROOT = Path(__file__).parent
source = json.loads((ROOT / 'quality-pass-verb-idioms-12-target.json').read_text())

def row_of(word, translation, typ=None):
    rows = [i for i, item in enumerate(source, 1)
            if item[:2] == [word, translation] and (typ is None or item[2] == typ)]
    assert len(rows) == 1, (word, translation, typ, rows)
    return rows[0]


replacements = {
    ('to deepen', 'становится глубже', None): ('становиться глубже', None),
    ('to have to', 'приходится', None): ('быть вынужденным', None),
    ('to pish', '"фи"', None): ('выражать презрение', None),
    ('to squib', 'эпиграммы', None): ('писать эпиграммы', None),
    ('to squib', 'пасквили', None): ('писать пасквили', None),
    ('that', 'что', 'наречие'): ('так', 'B2'),
    ('that', 'чтобы', 'наречие'): ('настолько', 'B2'),
    ('that', 'чтобы', 'местоимение'): ('тот', 'A1'),
}
level_only = {
    ('those', 'те', 'местоимение'): 'A1',
    ('these', 'это', 'местоимение'): 'A1',
    ('these', 'эти', 'местоимение'): 'A1',
}
deletes = [
    row_of('those', 'эти', 'местоимение'),
    row_of('those', 'то', 'местоимение'),
]

edits = []
target = [r[:] for r in source]
for (word, old, typ), (translation, level) in replacements.items():
    row = row_of(word, old, typ)
    before = source[row - 1]
    after = before[:]
    after[1] = translation
    if level:
        after[3] = level
    edits.append({'row': row, 'before': before, 'after': after})
    target[row - 1] = after
for (word, translation, typ), level in level_only.items():
    row = row_of(word, translation, typ)
    before = source[row - 1]
    after = before[:]
    after[3] = level
    edits.append({'row': row, 'before': before, 'after': after})
    target[row - 1] = after
removed = [{'row': row, 'before': source[row - 1]} for row in deletes]
for row in sorted(deletes, reverse=True):
    del target[row - 1]
seen = set()
for row in target[1:]:
    key = (row[0].casefold(), row[1].casefold(), row[2])
    assert key not in seen, key
    seen.add(key)
(ROOT / 'quality-pass-function-verb-13-plan.json').write_text(json.dumps({'edits': edits, 'deletes': removed}, ensure_ascii=False))
(ROOT / 'quality-pass-function-verb-13-target.json').write_text(json.dumps(target, ensure_ascii=False))
print('edits', len(edits), 'deletes', len(deletes), 'rows', len(target)-1, 'unique', len({r[0].casefold() for r in target[1:]}))
