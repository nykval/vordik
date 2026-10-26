"""Conservative cleanup of verified verbose or misleading translations."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-orphans-target.json").read_text(encoding="utf-8"))
edits = {
    26412: {1: "ахать"},
    26928: {1: "восхитительно"},
    31763: {1: "сигарета (сленг)", 2: "существительное", 4: "Тело и здоровье"},
    34724: {1: "дикая яблоня", 2: "существительное", 4: "Природа"},
    35650: {1: "кофе без кофеина", 4: "Еда и напитки"},
    46065: {1: "угольно-чёрный"},
    49776: {1: "насмешливо"},
    52797: {1: "страна-участница", 2: "существительное"},
    63842: {1: "трамвайный путь"},
    67113: {1: "работный дом", 4: "История и общество"},
    67721: {2: "существительное"},
}
deletes = {28418, 29079, 37653, 64182}

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

dups = [k for k, count in collections.Counter((r[0].casefold(), r[1].casefold(), r[2]) for r in target[1:]).items() if count > 1]
assert not dups, dups[:10]
plan = {
    "edits": changes,
    "deletes": [{"row": i, "before": source[i - 1]} for i in sorted(deletes, reverse=True)],
    "before_count": len(source) - 1,
    "after_count": len(target) - 1,
    "unique": len({r[0].casefold() for r in target[1:]}),
}
(BASE / "quality-pass-concise-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-concise-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v, list) else v for k, v in plan.items()})
