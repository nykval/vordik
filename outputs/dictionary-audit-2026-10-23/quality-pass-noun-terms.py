"""Classify verified multiword nouns as nouns and repair their translations."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-split-fragments-target.json").read_text(encoding="utf-8"))
edits = {
    39708: {1: "лётчик-истребитель", 2: "существительное", 4: "Работа"},
    39709: {2: "существительное"},
    46668: {1: "лабораторный халат", 2: "существительное", 4: "Одежда"},
    46669: {2: "существительное", 4: "Биология"},
    49095: {1: "медицинская справка", 2: "существительное", 4: "Тело и здоровье"},
    49096: {1: "состояние здоровья", 2: "существительное"},
    49097: {1: "история болезни", 2: "существительное", 4: "Тело и здоровье"},
    49098: {2: "существительное", 4: "Образование"},
    58073: {2: "существительное"},
    58074: {2: "существительное", 4: "Образование; Путешествия"},
    58075: {1: "школьный консультант", 2: "существительное", 4: "Образование"},
    58078: {2: "существительное"},
    58081: {2: "существительное"},
    58082: {2: "существительное", 4: "Образование; Одежда"},
    58083: {2: "существительное"},
    61640: {2: "существительное"},
}
target = [row.copy() for row in source]
changes = []
for i, cols in edits.items():
    old = source[i-1]
    assert old[2] == "фраза", (i, old)
    new = old.copy()
    for col, value in cols.items():
        new[col] = value
    target[i-1] = new
    changes.append({"row": i, "before": old, "after": new})
assert all(c == 1 for c in collections.Counter((r[0].casefold(),r[1].casefold(),r[2]) for r in target[1:]).values())
plan = {"edits": sorted(changes,key=lambda x:x['row']), "before_count": len(source)-1,
        "after_count": len(target)-1, "unique": len({r[0].casefold() for r in target[1:]})}
(BASE / "quality-pass-noun-terms-plan.json").write_text(json.dumps(plan,ensure_ascii=False),encoding="utf-8")
(BASE / "quality-pass-noun-terms-target.json").write_text(json.dumps(target,ensure_ascii=False),encoding="utf-8")
print({k: len(v) if isinstance(v,list) else v for k,v in plan.items()})
