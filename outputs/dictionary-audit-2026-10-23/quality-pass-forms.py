"""Fix confirmed malformed English forms and adjacent translation defects."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-next-target.json").read_text(encoding="utf-8"))
edits = {
    11665: {0: "shall", 2: "модальный глагол", 3: "B2"},
    14609: {1: "быть обязанным"},
    16061: {0: "could do with sth"},
    16062: {0: "could do with sth"},
    18957: {0: "can't get over sth"},
    33895: {0: "computed", 2: "прилагательное"},
    33896: {0: "computed", 2: "прилагательное"},
    43204: {0: "headhunting", 1: "поиск руководителей", 2: "существительное", 4: "Работа"},
    47283: {0: "lemme", 1: "позволь мне", 2: "сокращение"},
    47284: {0: "lemme", 1: "дай мне", 2: "сокращение"},
    47361: {0: "let's", 1: "давайте", 2: "сокращение"},
    47589: {1: "говорить нараспев"},
    47590: {1: "петь нараспев"},
}
deletes = {11703, 11704, 14610, 47591}

target = [source[0]]
changes = []
for i, old in enumerate(source[1:], 2):
    if i in deletes:
        continue
    new = old.copy()
    for col, value in edits.get(i, {}).items():
        new[col] = value
    if new != old:
        changes.append({"row": i, "before": old, "after": new})
    target.append(new)

keys = collections.Counter((row[0].casefold(), row[1].casefold(), row[2]) for row in target[1:])
assert all(c == 1 for c in keys.values()), [k for k, c in keys.items() if c > 1][:10]
plan = {"edits": changes, "deletes": [{"row": n, "before": source[n-1]} for n in sorted(deletes, reverse=True)],
        "before_count": len(source)-1, "after_count": len(target)-1,
        "unique": len({row[0].casefold() for row in target[1:]})}
(BASE / "quality-pass-forms-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-forms-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v, list) else v for k, v in plan.items()})
