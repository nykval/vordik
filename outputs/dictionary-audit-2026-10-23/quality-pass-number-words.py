"""Separate real senses of decade/age words and remove an inaccurate analogy."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-function-words-target.json").read_text(encoding="utf-8"))
edits = {
    37886: {1: "восьмидесятые годы", 3: "B2"},
    61644: {1: "скрытое послание"},
    64366: {1: "числа от 20 до 29", 3: "B2"},
}
adds = [
    ["eighties", "возраст от 80 до 89 лет", "существительное", "B2", ""],
    ["eighties", "числа от 80 до 89", "существительное", "B2", "Математика"],
    ["twenties", "двадцатые годы", "существительное", "B2", ""],
    ["twenties", "возраст от 20 до 29 лет", "существительное", "B2", ""],
]
target = [row.copy() for row in source]
changes = []
for i, cols in edits.items():
    old = source[i-1]
    new = old.copy()
    for col, value in cols.items():
        new[col] = value
    target[i-1] = new
    changes.append({"row": i, "before": old, "after": new})
target.extend(adds)
assert all(c == 1 for c in collections.Counter((r[0].casefold(),r[1].casefold(),r[2]) for r in target[1:]).values())
plan = {"edits": changes, "adds": adds, "before_count": len(source)-1,
        "after_count": len(target)-1, "unique": len({r[0].casefold() for r in target[1:]})}
(BASE / "quality-pass-number-words-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-number-words-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v,list) else v for k,v in plan.items()})
