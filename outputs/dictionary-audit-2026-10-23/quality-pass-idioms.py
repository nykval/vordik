"""Fix source-verified mistranslated everyday expressions."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-pos-mismatch-target.json").read_text(encoding="utf-8"))
edits = {
    26391: {1: "пруд пруди"},
    29432: {1: "стыдиться", 3: "B1"},
    29433: {1: "бодрствовать", 3: "B1"},
    29437: {1: "называться", 3: "A2"},
    29441: {1: "довольствоваться", 3: "B2"},
    29442: {1: "быть довольным", 3: "B1"},
    29448: {1: "быть в близких отношениях"},
    29450: {1: "разливать чай", 3: "C2", 4: "Еда и напитки"},
    29451: {1: "пожалуйста", 3: "B1"},
    29452: {1: "не определиться", 3: "B2"},
    29457: {1: "молчать", 3: "A2"},
}
adds = [["be my guest", "прошу", "фраза", "B1", ""]]
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
(BASE / "quality-pass-idioms-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-idioms-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v, list) else v for k, v in plan.items()})
