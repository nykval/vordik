"""Rejoin translations that had been split at commas into orphan rows."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-noun-terms-target.json").read_text(encoding="utf-8"))
edits = {
    4322: {1: "получатель выгоды", 3: "B2", 4: "Деньги"},
    4323: {1: "выгодоприобретатель", 4: "Деньги; Право"},
    21806: {1: "самовлюблённый человек"},
    27645: {1: "человек с ампутированной конечностью", 4: "Тело и здоровье"},
    28550: {1: "проситель убежища", 2: "существительное", 4: "Право"},
    32343: {1: "центральное украшение"},
    34373: {1: "защищённый авторским правом", 4: "Право"},
    36056: {1: "депозитарий", 4: "Деньги"},
    36072: {1: "помощник шерифа", 2: "существительное", 4: "Право"},
    36750: {1: "с дурной репутацией", 2: "прилагательное", 4: "Характер человека"},
    37650: {1: "получатель дохода", 4: "Деньги; Работа"},
    41481: {1: "пожилой человек"},
    41482: {1: "гериатрический", 2: "прилагательное"},
    42036: {1: "нервный", 2: "прилагательное"},
    42037: {1: "испуганный", 2: "прилагательное"},
    54260: {1: "разработчик политики", 4: "Политика"},
    54295: {1: "специалист по опросам", 4: "Общение"},
    56547: {1: "зарегистрированный участник"},
    59386: {1: "подписант"},
    59387: {1: "подписавшая сторона"},
}
deletes = {
    8376, 27646, 28551, 34374, 34375, 36073, 37651,
    54261, 54296, 56548, 59388,
    15271, 15272,  # User decision: remove the entire check-in counter entry.
}

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
dups = [k for k,c in collections.Counter((r[0].casefold(),r[1].casefold(),r[2]) for r in target[1:]).items() if c>1]
assert not dups, dups[:10]
plan = {"edits": changes, "deletes": [{"row": i, "before": source[i-1]} for i in sorted(deletes,reverse=True)],
        "before_count": len(source)-1, "after_count": len(target)-1,
        "unique": len({r[0].casefold() for r in target[1:]})}
(BASE / "quality-pass-orphans-plan.json").write_text(json.dumps(plan,ensure_ascii=False),encoding="utf-8")
(BASE / "quality-pass-orphans-target.json").write_text(json.dumps(target,ensure_ascii=False),encoding="utf-8")
print({k: len(v) if isinstance(v,list) else v for k,v in plan.items()})
