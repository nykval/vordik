"""Replace all remaining truncated {см dictionary import debris."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-meaning-errors-target.json").read_text(encoding="utf-8"))
edits = {
    33127: {1: "должность клерка", 4: "Работа"},
    49521: {1: "рождественский пирожок с сухофруктами", 2: "существительное", 3: "B2", 4: "Еда и напитки"},
    57753: {1: "фальсификация рудной пробы", 3: "C2"},
}
adds = [
    ["clerkship", "стажировка у судьи", "существительное", "C1", "Право; Работа"],
    ["salting", "засолка", "существительное", "B2", "Еда и напитки"],
    ["salting", "соление", "существительное", "B2", "Еда и напитки"],
]
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
assert not any("{см" in r[1] for r in target[1:])
dups = [k for k, count in collections.Counter((r[0].casefold(), r[1].casefold(), r[2]) for r in target[1:]).items() if count > 1]
assert not dups, dups[:10]
plan = {"edits": changes, "adds": adds, "before_count": len(source)-1, "after_count": len(target)-1,
        "unique": len({r[0].casefold() for r in target[1:]})}
(BASE / "quality-pass-truncated-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-truncated-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v, list) else v for k, v in plan.items()})
