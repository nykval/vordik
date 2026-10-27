"""Repair source-checked adverb/adjective mismatches."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-idioms-target.json").read_text(encoding="utf-8"))
edits = {
    27397: {1: "включающий все расходы", 2: "прилагательное", 3: "B2", 4: "Деньги"},
    29234: {1: "без седла", 4: "Животные"},
    33863: {2: "прилагательное"},
    33864: {2: "прилагательное"},
    38720: {1: "навеки"},
    41413: {2: "прилагательное"},
    43425: {1: "настоящим", 4: "Право"},
    51177: {1: "на северо-восток", 4: "Природа"},
    51615: {2: "прилагательное", 4: "Искусство и медиа"},
    51616: {2: "прилагательное", 4: "Искусство и медиа"},
    67293: {2: "прилагательное"},
}
deletes = {10588}
adds = [
    ["someplace", "куда-нибудь", "наречие", "B1", ""],
    ["offstage", "за сценой", "наречие", "C1", "Искусство и медиа"],
]
changes, target = [], [source[0]]
for i, old in enumerate(source[1:], 2):
    if i in deletes:
        continue
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
plan = {"edits": changes, "deletes": [{"row": i, "before": source[i-1]} for i in sorted(deletes, reverse=True)],
        "adds": adds, "before_count": len(source)-1, "after_count": len(target)-1,
        "unique": len({r[0].casefold() for r in target[1:]})}
(BASE / "quality-pass-adverbs-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-adverbs-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v, list) else v for k, v in plan.items()})
