"""Resolve remaining compressed (ся) translations with source-backed senses."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-reflexive-target.json").read_text(encoding="utf-8"))
# Each item is one revised current row and zero or one extra accepted sense.
replacements = {
    34231: ("сократительный", None, "Биология; Тело и здоровье"),
    36864: ("делить", None, None),
    45546: ("смешивать", "смешиваться", None),
    45547: ("перемешивать", "перемешиваться", None),
    46157: ("теснить", None, None),
    46166: ("трясти", "подпрыгивать", None),
    47370: ("поднимать в воздух", "парить в воздухе", None),
    47761: ("оживить", "оживиться", None),
    47762: ("развеселить", "развеселиться", None),
    50602: ("натурализовать", "натурализоваться", "Право"),
    55650: ("толкать лодку шестом", None, None),
    64664: ("распрямлять", "распрямляться", None),
}

edits, adds, target = [], [], [source[0]]
for i, old in enumerate(source[1:], 2):
    if i in replacements:
        assert "(ся)" in old[1] or " (ся)" in old[1], (i, old)
        first, second, topic = replacements[i]
        new = old.copy()
        new[1] = first
        if topic is not None:
            new[4] = topic
        edits.append({"row": i, "before": old, "after": new})
        target.append(new)
        if second:
            extra = new.copy()
            extra[1] = second
            adds.append(extra)
    else:
        target.append(old)
target.extend(adds)
assert len(edits) == len(replacements)
dups = [k for k, count in collections.Counter((r[0].casefold(), r[1].casefold(), r[2]) for r in target[1:]).items() if count > 1]
assert not dups, dups[:10]
plan = {
    "edits": edits,
    "adds": adds,
    "before_count": len(source) - 1,
    "after_count": len(target) - 1,
    "unique": len({r[0].casefold() for r in target[1:]}),
}
(BASE / "quality-pass-reflexive-remaining-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-reflexive-remaining-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v, list) else v for k, v in plan.items()})
