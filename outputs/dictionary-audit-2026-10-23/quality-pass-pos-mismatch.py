"""Repair source-checked English POS / Russian-form mismatches."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-phrasal-concise-2-target.json").read_text(encoding="utf-8"))
edits = {
    20111: {2: "существительное"},
    21664: {1: "налаживание связей", 4: "Общение; Работа"},
    21665: {1: "создание компьютерной сети", 4: "Технологии"},
    21699: {1: "пищевой"},
    21710: {1: "лицевая сторона", 2: "существительное", 4: "Деньги"},
    21711: {2: "существительное"},
    22209: {1: "самостоятельное приготовление пищи", 2: "существительное", 3: "C1"},
    22210: {1: "с возможностью готовить самостоятельно", 3: "C1"},
    37506: {1: "темница", 3: "C1"},
    53882: {1: "сочувствующий"},
    55084: {1: "содержащий обещание"},
    67153: {1: "тревожный", 4: ""},
    67154: {1: "вызывающий беспокойство", 4: ""},
}
deletes = {21698, 25425, 53884, 55085, 67155}
adds = [["aging", "стареющий", "прилагательное", "B2", ""]]

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
(BASE / "quality-pass-pos-mismatch-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-pos-mismatch-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v, list) else v for k, v in plan.items()})
