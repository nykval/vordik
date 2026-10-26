"""Correct compressed forms and preserve distinct verified dictionary senses."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-noun-compounds-target.json").read_text(encoding="utf-8"))
edits = {
    27749: {1: "аневризма"},
    30853: {1: "брама (порода кур)", 4: "Животные; Сельское хозяйство"},
    36315: {1: "десяток шкур", 4: "Покупки; История и общество"},
    44002: {1: "чулочные изделия"},
    49015: {1: "время приёма пищи", 3: "B1", 4: "Еда и напитки"},
    53124: {1: "катышек"},
    56701: {1: "трапеза", 4: "Еда и напитки"},
    61330: {1: "скот для откорма", 2: "существительное", 3: "C1", 4: "Сельское хозяйство"},
    61901: {1: "ранее"},
    65412: {1: "по-разному", 3: "C1"},
}
adds = [
    ["dicker", "торг", "существительное", "C2", "Покупки"],
    ["pellet", "гранула", "существительное", "C1", ""],
]
changes, target = [], [source[0]]
for i, old in enumerate(source[1:], 2):
    new = old.copy()
    for col, value in edits.get(i, {}).items():
        new[col] = value
    if new != old:
        changes.append({"row": i, "before": old, "after": new})
    target.append(new)
target.extend(adds)
assert len(changes) == len(edits)
dups = [k for k, count in collections.Counter((r[0].casefold(), r[1].casefold(), r[2]) for r in target[1:]).items() if count > 1]
assert not dups, dups[:10]
plan = {"edits": changes, "adds": adds, "before_count": len(source)-1, "after_count": len(target)-1,
        "unique": len({r[0].casefold() for r in target[1:]})}
(BASE / "quality-pass-compact-and-senses-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-compact-and-senses-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v, list) else v for k, v in plan.items()})
