"""Split verified Russian reflexive/non-reflexive pairs into separate rows."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-source-check-target.json").read_text(encoding="utf-8"))
pairs = {
    36625: ("освобождать", "освобождаться"),
    42966: ("делать твёрдым", "становиться твёрдым"),
    45501: ("связывать", "связываться"),
    45530: ("переплетать", "переплетаться"),
    45531: ("сплетать", "сплетаться"),
    45534: ("соединять", "соединяться"),
    45535: ("сцеплять", "сцепляться"),
    45552: ("смешивать", "смешиваться"),
    45553: ("перемешивать", "перемешиваться"),
    46156: ("толкать", "толкаться"),
    55751: ("оживлять", "оживляться"),
    55791: ("увеличивать в пять раз", "увеличиваться в пять раз"),
    56407: ("усиливать", "усиливаться"),
    56408: ("увеличивать", "увеличиваться"),
    56801: ("переселять", "переселяться"),
    58450: ("отделять", "отделяться"),
    59262: ("сморщивать", "сморщиваться"),
    61592: ("подразделять", "подразделяться"),
    65044: ("развёртывать", "развёртываться"),
    65065: ("отвинчивать", "отвинчиваться"),
}

edits, adds, target = [], [], [source[0]]
for i, old in enumerate(source[1:], 2):
    if i in pairs:
        assert "(ся)" in old[1] or " (ся)" in old[1], (i, old)
        assert old[2] == "глагол", (i, old)
        first, second = pairs[i]
        new = old.copy()
        new[1] = first
        extra = old.copy()
        extra[1] = second
        edits.append({"row": i, "before": old, "after": new})
        adds.append(extra)
        target.append(new)
    else:
        target.append(old)
target.extend(adds)
assert len(edits) == len(pairs)
dups = [k for k, count in collections.Counter((r[0].casefold(), r[1].casefold(), r[2]) for r in target[1:]).items() if count > 1]
assert not dups, dups[:10]
plan = {
    "edits": edits,
    "adds": adds,
    "before_count": len(source) - 1,
    "after_count": len(target) - 1,
    "unique": len({r[0].casefold() for r in target[1:]}),
}
(BASE / "quality-pass-reflexive-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-reflexive-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v, list) else v for k, v in plan.items()})
