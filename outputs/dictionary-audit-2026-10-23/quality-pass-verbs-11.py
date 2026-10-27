import json
from pathlib import Path

ROOT = Path(__file__).parent
source = json.loads((ROOT / 'quality-pass-comma-senses-10-target.json').read_text())

def row_of(word, translation):
    rows = [i for i, item in enumerate(source, 1) if item[:2] == [word, translation]]
    assert len(rows) == 1, (word, translation, rows)
    return rows[0]


replacements = {
    ('to scribble', 'каракули'): {'translation': 'писать каракули'},
    ('to ablative', 'аблатив'): {'word': 'ablative', 'type': 'существительное'},
    ('to anticipatory', 'порочащий новизну'): {'word': 'anticipatory', 'translation': 'предвосхищающий', 'type': 'прилагательное'},
    ('aula', 'очаг гиперемии (медицина)'): {'translation': 'актовый зал', 'theme': 'Образование'},
    ('to chaperon', 'сопровождающий (для присмотра)'): {'translation': 'сопровождать (для присмотра)'},
    ('to cuddle', 'друг другу'): {'translation': 'обниматься'},
    ('to dispossess', 'права владения'): {'translation': 'лишать права владения'},
    ('to gingerbread', 'имбирный пряник'): {'word': 'gingerbread', 'type': 'существительное'},
    ('to gutter', 'канавки'): {'translation': 'прокладывать канавки'},
    ('to headwind', 'встречный ветер'): {'word': 'headwind', 'type': 'существительное'},
    ('to jury-rig', 'на скорую руку'): {'translation': 'мастерить из подручных средств'},
    ('to marginalize', 'делать примечания'): {'translation': 'оттеснять на второй план'},
    ('to marginalize', 'заметки на полях (книги)'): {'translation': 'лишать влияния'},
    ('to mis-state', 'делать неправильное'): {'word': 'to misstate', 'translation': 'неверно излагать'},
    ('to mis-state', 'ложное заявление'): {'word': 'to misstate', 'translation': 'искажать'},
    ('to mosey', 'быстро уходить'): {'translation': 'брести'},
    ('to mosey', 'сматываться'): {'translation': 'прогуливаться'},
    ('to predate', 'датировать задним'): {'translation': 'предшествовать'},
    ('to reinterpret', 'давать новое'): {'translation': 'переосмысливать'},
    ('to reinterpret', 'другое истолкование чему-л'): {'translation': 'трактовать по-новому'},
    ('to self-reference', 'ссылка на себя'): {'translation': 'ссылаться на себя'},
    ('to unburden', 'ношу'): {'translation': 'разгружать'},
}
deletes = [
    row_of('to ablative', 'творительный падеж (грамматика)'),
    row_of('to incapacitate', 'непригодным'),
    row_of('to misdirect', 'неверно'),
    row_of('to predate', 'более ранним числом'),
]

edits = []
target = [r[:] for r in source]
keys = ['word', 'translation', 'type', 'level', 'theme']
for (word, translation), values in replacements.items():
    row = row_of(word, translation)
    before = source[row - 1]
    after = before[:]
    for key, value in values.items():
        after[keys.index(key)] = value
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
assert len(target) == len(source) - len(deletes)
(ROOT / 'quality-pass-verbs-11-plan.json').write_text(json.dumps({'edits': edits, 'deletes': removed}, ensure_ascii=False))
(ROOT / 'quality-pass-verbs-11-target.json').write_text(json.dumps(target, ensure_ascii=False))
print('edits', len(edits), 'deletes', len(deletes), 'rows', len(target)-1, 'unique', len({r[0].casefold() for r in target[1:]}))
