"""Finish compressed Russian participles for staying."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-reflexive-remaining-target.json").read_text(encoding="utf-8"))
edits = {
    61085: "останавливающийся",
    61086: "задерживающийся",
}
changes, target = [], [source[0]]
for i, old in enumerate(source[1:], 2):
    new = old.copy()
    if i in edits:
        assert "(ся)" in old[1], (i, old)
        new[1] = edits[i]
        changes.append({"row": i, "before": old, "after": new})
    target.append(new)
add = ["staying", "остающийся", "прилагательное", "A2", ""]
target.append(add)
dups = [k for k, count in collections.Counter((r[0].casefold(), r[1].casefold(), r[2]) for r in target[1:]).items() if count > 1]
assert not dups, dups[:10]
plan = {"edits": changes, "adds": [add], "before_count": len(source)-1, "after_count": len(target)-1,
        "unique": len({r[0].casefold() for r in target[1:]})}
(BASE / "quality-pass-staying-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-staying-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v, list) else v for k, v in plan.items()})
