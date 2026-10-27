"""Fix malformed verb headwords and their mismatched translations."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-phrasal-concise-4-target.json").read_text(encoding="utf-8"))
edits = {
    15881: {1: "быть усеянным"},
    19193: {0: "to get at sth", 1: "намекать", 3: "C1"},
    19194: {0: "to get at sth", 1: "говорить намёками", 3: "C1"},
    19669: {0: "to be snowed under"},
    19726: {1: "унаследовать должность", 3: "C1"},
    23109: {0: "to proceed to sth", 1: "переходить к следующему этапу"},
    51202: {0: "nose-picking", 2: "существительное"},
}
changes, target = [], [source[0]]
for i, old in enumerate(source[1:], 2):
    new = old.copy()
    for col, value in edits.get(i, {}).items():
        new[col] = value
    if new != old:
        changes.append({"row": i, "before": old, "after": new})
    target.append(new)
assert len(changes) == len(edits)
dups = [k for k, count in collections.Counter((r[0].casefold(), r[1].casefold(), r[2]) for r in target[1:]).items() if count > 1]
assert not dups, dups[:10]
plan = {"edits": changes, "before_count": len(source)-1, "after_count": len(target)-1,
        "unique": len({r[0].casefold() for r in target[1:]})}
(BASE / "quality-pass-malformed-headwords-5-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-malformed-headwords-5-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v, list) else v for k, v in plan.items()})
