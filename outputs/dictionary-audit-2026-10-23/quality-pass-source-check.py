"""Correct obvious dictionary contradictions against reference definitions."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-concise-target.json").read_text(encoding="utf-8"))
edits = {
    31288: {1: "сносить бульдозером", 4: "Действия человека"},
    42693: {0: "ha-ha", 1: "скрытый ров", 3: "C2", 4: "Природа"},
    48086: {1: "с глубоким вырезом", 4: "Одежда"},
}
deletes = {49712, 56510}
adds = [["to bulldoze", "принуждать", "глагол", "C1", "Действия человека"]]

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
target.extend(adds)
dups = [k for k, count in collections.Counter((r[0].casefold(), r[1].casefold(), r[2]) for r in target[1:]).items() if count > 1]
assert not dups, dups[:10]
plan = {
    "edits": changes,
    "deletes": [{"row": i, "before": source[i - 1]} for i in sorted(deletes, reverse=True)],
    "adds": adds,
    "before_count": len(source) - 1,
    "after_count": len(target) - 1,
    "unique": len({r[0].casefold() for r in target[1:]}),
}
(BASE / "quality-pass-source-check-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-source-check-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v, list) else v for k, v in plan.items()})
