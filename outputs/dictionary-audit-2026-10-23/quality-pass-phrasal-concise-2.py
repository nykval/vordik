"""Shorten clear phrasal-verb glosses without merging distinct senses."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-truncated-target.json").read_text(encoding="utf-8"))
# Original source glosses were explanatory sentences, not usable translations.
edits = {
    15883: {1: "состоять из"},
    15931: {1: "напоминать"},
    15937: {1: "освежать знания"},
    15941: {1: "кипеть от восторга"},
    15982: {1: "догонять"},
    16041: {1: "возникать в разговоре"},
    16085: {1: "читать выборочно"},
    16089: {1: "разделять на части"},
    16113: {1: "ответить по электронной почте"},
    16164: {1: "вынудить покинуть дом из-за наводнения"},
    16210: {1: "уступать"},
    16238: {1: "предпочитать"},
    16273: {0: "to hang about", 1: "слоняться"},
    16275: {0: "to hang out", 1: "проводить время"},
    16345: {1: "присоединяться"},
    16357: {1: "придерживаться"},
    16378: {1: "расслабиться"},
    16490: {1: "убрать на место"},
    16575: {0: "to rain sth off", 1: "отменить из-за дождя"},
    16651: {1: "войти в систему"},
    18855: {1: "лезть из кожи вон"},
    18942: {1: "не переставать удивляться"},
    19256: {1: "ставить в вину"},
    19384: {1: "справиться кое-как"},
    19533: {1: "вынести на обсуждение"},
    19531: {1: "подстрекать"},
    19691: {1: "искоренять"},
    19756: {1: "срывать злость на ком-то"},
    19758: {1: "перенимать обязанности"},
    19834: {1: "взвесить все за и против"},
}

changes, target = [], [source[0]]
for i, old in enumerate(source[1:], 2):
    new = old.copy()
    for col, value in edits.get(i, {}).items():
        new[col] = value
    if new != old:
        changes.append({"row": i, "before": old, "after": new})
    target.append(new)
assert len(changes) == len(edits)
dups = [k for k, count in collections.Counter((r[0].casefold(), r[1].casefold(), r[2]) for r in target[1:]).items() if count > 1]
assert not dups, dups[:10]
plan = {"edits": changes, "before_count": len(source)-1, "after_count": len(target)-1,
        "unique": len({r[0].casefold() for r in target[1:]})}
(BASE / "quality-pass-phrasal-concise-2-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-phrasal-concise-2-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v, list) else v for k, v in plan.items()})
