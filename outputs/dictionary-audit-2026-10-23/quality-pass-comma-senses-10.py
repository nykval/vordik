import json
from pathlib import Path

ROOT = Path(__file__).parent
source = json.loads((ROOT / 'quality-pass-idioms-9-target.json').read_text())

def row_of(word, translation):
    rows = [i for i, item in enumerate(source, 1) if item[:2] == [word, translation]]
    assert len(rows) == 1, (word, translation, rows)
    return rows[0]


split = {
    ('to some degree', 'в какой-то степени, в некоторой степени, отчасти'): ['в какой-то степени', 'отчасти'],
    ('to some extent', 'в какой-то мере, отчасти, в некоторой степени'): ['в какой-то мере', 'отчасти'],
    ('all the best', 'всего хорошего, всего доброго, всего наилучшего'): ['всего хорошего', 'всего доброго', 'всего наилучшего'],
    ('as a matter of fact', 'фактически, на самом деле, в действительности'): ['фактически', 'на самом деле', 'в действительности'],
    ('at length', 'детально, обстоятельно, со всеми подробностями'): ['подробно', 'долго', 'наконец'],
    ('drop by drop', 'капля за каплей, по капле, медленно и постепенно'): ['капля за каплей', 'по капле'],
    ('in point of fact', 'фактически, на самом деле, в действительности'): ['фактически', 'на самом деле'],
    ('no way', 'никоим образом, ни за что'): ['никоим образом', 'ни за что'],
    ('and yet it moves', 'а всё-таки она вертится, и всё-таки она вертится'): ['а всё-таки она вертится'],
    ('lump sugar', 'кусковой сахар, колотый сахар, пилёный сахар'): ['кусковой сахар'],
    ('hot off the press', 'прямо из типографии, только что отпечатанный'): ['только что отпечатанный'],
    ('at the discretion of', 'по усмотрению кого-либо, на усмотрение кого-либо'): ['по усмотрению кого-либо'],
}
deletes = [
    row_of('tonight', 'на вечер'),
    row_of('conversely', 'в обратном порядке'),
    row_of('aimless', 'без направления'),
    row_of('aimlessly', 'без направления'),
    row_of('affordably', 'по карману'),
    row_of('chronological', 'по времени'),
]

edits = []
adds = []
target = [r[:] for r in source]
for (word, old), translations in split.items():
    row = row_of(word, old)
    before = source[row - 1]
    after = before[:]
    after[1] = translations[0]
    if word == 'at length':
        after[3] = 'C2'
    edits.append({'row': row, 'before': before, 'after': after})
    target[row - 1] = after
    for translation in translations[1:]:
        new = after[:]
        new[1] = translation
        adds.append(new)

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
(ROOT / 'quality-pass-comma-senses-10-plan.json').write_text(json.dumps({'edits': edits, 'deletes': removed, 'adds': adds}, ensure_ascii=False))
(ROOT / 'quality-pass-comma-senses-10-target.json').write_text(json.dumps(target, ensure_ascii=False))
print('edits', len(edits), 'deletes', len(deletes), 'adds', len(adds), 'rows', len(target)-1, 'unique', len({r[0].casefold() for r in target[1:]}))
