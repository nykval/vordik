import json
from pathlib import Path

ROOT = Path(__file__).parent
source = json.loads((ROOT / 'quality-pass-phrasal-concise-6-target.json').read_text())
edits = {
    16104: ('to drop around sth', 'доставлять'),
    16156: ('to fix sth up', 'организовать'),
    16157: ('to fix sb up with sth', 'обеспечивать'),
    16380: ('to live off sth', 'питаться (определённой пищей)'),
    16381: ('to live off sth/sb', 'жить за счёт'),
    16400: ('to look after sb/sth', 'заботиться'),
    16434: ('to meet with sb', 'встречаться для обсуждения'),
    16600: ('to root for sb', 'болеть за'),
    16601: ('to root for sb', 'поддерживать'),
    18834: ('to bash sth/sb about', 'грубо обращаться'),
    18839: ('to be meant to do sth', 'предназначаться'),
    19396: ('to open onto sth', 'выходить на'),
    19432: ('to pass off', 'проходить'),
    19755: ('to take over', 'брать верх'),
    47076: ('to lead back to', 'возвращаться к теме'),
    59723: ('to sleep with', 'заниматься сексом'),
}
deletes = [15264, 15265]
changes = []
target = [r[:] for r in source]
for row, (word, translation) in edits.items():
    before = source[row - 1]
    after = [word, translation, *before[2:]]
    changes.append({'row': row, 'before': before, 'after': after})
    target[row - 1] = after
removed = [{'row': row, 'before': source[row - 1]} for row in deletes]
for row in sorted(deletes, reverse=True):
    del target[row - 1]
assert len(target) == len(source) - len(deletes)
assert not any(r[0] == 'check-in (counter)' for r in target)
assert not any(r[0] == 'chat show' and r[1] == 'беседа' for r in target)
seen = set()
for row in target[1:]:
    key = (row[0].casefold(), row[1].casefold(), row[2])
    assert key not in seen, key
    seen.add(key)
(ROOT / 'quality-pass-phrasal-precise-7-plan.json').write_text(json.dumps({'edits': changes, 'deletes': removed}, ensure_ascii=False))
(ROOT / 'quality-pass-phrasal-precise-7-target.json').write_text(json.dumps(target, ensure_ascii=False))
print('edits', len(changes), 'deletes', len(deletes), 'rows', len(target)-1, 'unique', len({r[0].casefold() for r in target[1:]}))
