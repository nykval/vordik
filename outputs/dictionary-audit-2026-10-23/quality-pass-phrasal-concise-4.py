"""Compact another group of verbose phrasal-verb glosses, preserving senses."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-phrasal-meaning-3-target.json").read_text(encoding="utf-8"))
edits = {
    16035: {1: "вернуться к теме"},
    16192: {1: "не успевать"},
    16211: {1: "раздавать"},
    16215: {1: "бросать (занятие)"},
    16229: {1: "возвращаться к учёбе"},
    16238: {1: "участвовать"},
    16247: {1: "переживать трудности"},
    16305: {1: "сдавать в аренду"},
    16315: {1: "накаляться"},
    16385: {1: "оправдывать ожидания"},
    16402: {1: "планировать наперёд"},
    16412: {1: "бегло осматривать"},
    16611: {1: "повторять для проверки"},
    16638: {1: "организовать"},
    16645: {1: "проводить к выходу"},
    16683: {0: "to stand about", 1: "стоять без дела"},
    16684: {1: "поддерживать"},
    16707: {1: "заехать по пути"},
    16726: {1: "возвращать"},
    16759: {1: "убирать на место"},
    16798: {1: "разминаться"},
    16828: {1: "выписывать полностью"},
    18844: {1: "быть озадаченным"},
    18886: {1: "струсить"},
    19120: {1: "сорваться (о планах)"},
    19338: {1: "смотреть свысока"},
    19354: {1: "едва различать"},
    19482: {1: "вкладывать много денег"},
    19684: {1: "выкраивать время"},
    19753: {1: "брать на себя"},
    19771: {1: "отличать"},
    19773: {1: "продумывать последствия"},
    19774: {1: "погрузиться в дело"},
    40126: {1: "включать"},
}
adds = [["to warm up (sth)", "разогревать", "фразовый глагол", "B1", ""]]
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
(BASE / "quality-pass-phrasal-concise-4-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-phrasal-concise-4-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v, list) else v for k, v in plan.items()})
