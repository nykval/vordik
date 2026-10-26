"""Make technical noun compounds concise and type them as nouns."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-staying-target.json").read_text(encoding="utf-8"))
edits = {
    28633: {1: "мигание внимания", 2: "существительное", 4: "Тело и здоровье"},
    36998: {1: "доминантный признак", 2: "существительное"},
    39633: {1: "фидуциарная обязанность", 2: "существительное", 3: "C2", 4: "Право; Деньги"},
    39779: {1: "финансовая система", 2: "существительное"},
    39849: {1: "брандер", 2: "существительное", 3: "C2", 4: "История и общество"},
    44230: {1: "присяжные, не вынесшие вердикт", 2: "существительное", 3: "C1"},
    45405: {1: "акт о капитуляции", 2: "существительное", 3: "C1"},
    46827: {1: "страна без выхода к морю", 2: "существительное"},
    49465: {1: "военная политика", 2: "существительное"},
    53492: {1: "фазовая диаграмма", 2: "существительное"},
    54258: {1: "политическая философия", 2: "существительное"},
    55102: {1: "местоименное наречие", 2: "существительное"},
    59488: {1: "однозначная функция", 2: "существительное"},
    60092: {1: "социальный капитал", 2: "существительное"},
    60522: {1: "удельная поверхность", 2: "существительное"},
    63192: {1: "трёхмерное пространство"},
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
(BASE / "quality-pass-noun-compounds-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-noun-compounds-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v, list) else v for k, v in plan.items()})
