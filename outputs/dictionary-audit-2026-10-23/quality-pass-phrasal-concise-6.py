"""Replace long phrasal explanations with complete Russian equivalents."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-malformed-headwords-5-target.json").read_text(encoding="utf-8"))
edits = {
    15878: {1: "быть отрезанным от мира"},
    15970: {1: "успокаиваться"},
    16071: {1: "датироваться"},
    16160: {1: "пролистывать"},
    16173: {1: "высвобождать"},
    16190: {1: "связаться позже"},
    16196: {1: "потерять доступ к аккаунту"},
    16208: {1: "отдавать даром"},
    16245: {1: "встречаться (в романтическом смысле)"},
    16266: {1: "сдавать работу"},
    16275: {1: "класть трубку"},
    16300: {1: "помогать снять одежду"},
    16339: {1: "приглашать наверх"},
    16347: {1: "ухватиться за шанс"},
    16384: {1: "пережить"},
    16411: {1: "высматривать"},
    16430: {1: "отмерять"},
    16522: {1: "осваивать"},
    16532: {1: "указывать"},
    16567: {1: "соединить по телефону"},
    16568: {1: "приютить"},
    16620: {1: "прокручивать по экрану"},
    16651: {1: "записываться"},
    16658: {1: "обдумать до завтра"},
    16685: {1: "обозначать"},
    16686: {1: "подменять"},
    16763: {1: "приземляться"},
    16784: {1: "вводить с клавиатуры"},
    16790: {1: "ждать без дела"},
    18843: {1: "опешить"},
    18903: {1: "успешно осуществить"},
    18924: {1: "поверить в идею"},
    19176: {1: "обойти препятствие"},
    19188: {1: "отомстить"},
    19457: {1: "постепенно выводить из употребления"},
    19626: {1: "поддержать"},
    19632: {1: "пародировать"},
    19639: {1: "приступать"},
    19675: {1: "разобраться с делами"},
    19707: {1: "не вмешиваться"},
    19711: {1: "задержаться"},
    19732: {1: "разобраться"},
    19776: {1: "совпадать по времени"},
    19777: {1: "тайно предупреждать"},
    19848: {1: "списывать со счетов"},
    63312: {1: "сковывать противника"},
    67692: {1: "подготовить к использованию"},
}
adds = [["to calm down (sth)", "успокаивать", "фразовый глагол", "B1", ""]]
deletes = {16288}
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
plan = {"edits": changes, "deletes": [{"row": i, "before": source[i-1]} for i in sorted(deletes, reverse=True)],
        "adds": adds, "before_count": len(source)-1, "after_count": len(target)-1,
        "unique": len({r[0].casefold() for r in target[1:]})}
(BASE / "quality-pass-phrasal-concise-6-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-phrasal-concise-6-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v, list) else v for k, v in plan.items()})
