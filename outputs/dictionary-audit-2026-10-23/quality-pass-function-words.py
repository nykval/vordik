"""Fix Russian meanings filed under the wrong functional type."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-forms-target.json").read_text(encoding="utf-8"))
edits = {
    14525: {3: "A1"},
    18060: {1: "на пути"},
}
deletes = {8727, 12060, 13662, 13979, 13980, 17417, 18061}
target = [source[0]]
changes = []
for i, old in enumerate(source[1:], 2):
    if i in deletes:
        continue
    new = old.copy()
    for col, val in edits.get(i, {}).items():
        new[col] = val
    if new != old:
        changes.append({"row": i, "before": old, "after": new})
    target.append(new)
assert all(c == 1 for c in collections.Counter((r[0].casefold(), r[1].casefold(), r[2]) for r in target[1:]).values())
plan = {"edits": changes, "deletes": [{"row": i, "before": source[i-1]} for i in sorted(deletes, reverse=True)],
        "before_count": len(source)-1, "after_count": len(target)-1,
        "unique": len({r[0].casefold() for r in target[1:]})}
(BASE / "quality-pass-function-words-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-function-words-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v, list) else v for k, v in plan.items()})
