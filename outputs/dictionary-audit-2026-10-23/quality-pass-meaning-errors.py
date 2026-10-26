"""Correct source-verified semantic and truncated-definition errors."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-compact-and-senses-target.json").read_text(encoding="utf-8"))
edits = {
    16272: {1: "передавать по кругу"},
    16702: {1: "выступать", 3: "B2"},
    19464: {1: "добиться точного ответа"},
    19678: {1: "спровоцировать"},
    19787: {1: "разыскать"},
    46493: {1: "человек, влияющий на выбор лидера", 4: "Политика"},
    49344: {1: "клетка для ловчих птиц", 3: "C2", 4: "Животные"},
    55839: {1: "организованная преступная деятельность", 4: "Право; Деньги"},
    57532: {1: "кандидат в вице-президенты", 2: "существительное", 3: "C1", 4: "Политика"},
    60916: {1: "правая сторона сцены (для актёра)", 2: "существительное", 3: "C1", 4: "Искусство и медиа"},
}
deletes = {45186, 46494, 49345}
adds = [
    ["mew", "мяуканье", "существительное", "B2", "Животные"],
    ["to mew", "мяукать", "глагол", "B2", "Животные"],
    ["racketeering", "рэкет", "существительное", "C1", "Право; Деньги"],
    ["stage right", "справа на сцене (для актёра)", "наречие", "C1", "Искусство и медиа"],
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
plan = {
    "edits": changes,
    "deletes": [{"row": i, "before": source[i-1]} for i in sorted(deletes, reverse=True)],
    "adds": adds,
    "before_count": len(source)-1,
    "after_count": len(target)-1,
    "unique": len({r[0].casefold() for r in target[1:]}),
}
(BASE / "quality-pass-meaning-errors-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-meaning-errors-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v, list) else v for k, v in plan.items()})
