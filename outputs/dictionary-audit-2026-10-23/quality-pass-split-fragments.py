"""Repair a few remaining translations that were split across rows."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-phrasal-target.json").read_text(encoding="utf-8"))
edits = {
    39709: {0: "fight-or-flight response", 1: "реакция борьбы или бегства", 4: "Тело и здоровье"},
    46669: {1: "молитва «Господи, помилуй»"},
}
deletes = {14209, 18309, 39710, 46670}
changes, target = [], [source[0]]
for i, old in enumerate(source[1:], 2):
    if i in deletes:
        continue
    new = old.copy()
    for col, val in edits.get(i, {}).items():
        new[col] = val
    if new != old:
        changes.append({"row": i, "before": old, "after": new})
    target.append(new)
assert all(c == 1 for c in collections.Counter((r[0].casefold(),r[1].casefold(),r[2]) for r in target[1:]).values())
plan = {"edits": changes, "deletes": [{"row": i, "before": source[i-1]} for i in sorted(deletes, reverse=True)],
        "before_count": len(source)-1, "after_count": len(target)-1,
        "unique": len({r[0].casefold() for r in target[1:]})}
(BASE / "quality-pass-split-fragments-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-split-fragments-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v,list) else v for k,v in plan.items()})
