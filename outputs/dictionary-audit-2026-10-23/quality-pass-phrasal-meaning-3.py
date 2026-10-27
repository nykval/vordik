"""Correct source-checked phrasal-verb meanings and shorten explanations."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-adverbs-target.json").read_text(encoding="utf-8"))
edits = {
    15966: {1: "зайти ненадолго"},
    16151: {1: "доводить до конца"},
    16152: {1: "расставаться"},
    16193: {1: "сводить концы с концами"},
    16195: {1: "прибывать (о транспорте)"},
    16268: {1: "раздавать"},
    16306: {1: "сразу найти общий язык"},
    16417: {1: "искать сведения"},
    16455: {1: "съезжаться"},
    16603: {1: "втирать"},
    16783: {1: "увеличивать громкость"},
    18852: {1: "энергично браться за дело", 3: "C2"},
    19611: {1: "достигать большой суммы"},
    19627: {1: "видеть насквозь"},
    58630: {1: "сажать в тюрьму", 3: "C1", 4: "Право"},
    59960: {1: "незаметно уходить"},
    67450: {1: "пристреливать оружие", 3: "C1"},
}
deletes = {59961}
adds = [
    ["to see through sb/sth", "распознавать обман", "фразовый глагол", "B2", ""],
    ["to send down", "исключать из университета", "фразовый глагол", "C1", "Образование"],
    ["to turn up sth", "увеличивать температуру", "фразовый глагол", "B1", ""],
    ["to zero in on sth", "сосредоточиться", "фразовый глагол", "C1", ""],
    ["to zero in on sth", "прицелиться", "фразовый глагол", "C1", ""],
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
(BASE / "quality-pass-phrasal-meaning-3-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-phrasal-meaning-3-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v, list) else v for k, v in plan.items()})
