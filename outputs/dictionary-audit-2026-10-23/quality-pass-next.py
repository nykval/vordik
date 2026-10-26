"""Prepare a conservative, source-checked cleanup against round 2 live data."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "review-round2-approved.json").read_text(encoding="utf-8"))

# Keys are current, 1-based Google Sheets row numbers. Only clear translation,
# morphology, HTML-entity, and part-of-speech errors are included here.
edits = {
    8585: {0: "ought to", 2: "модальный глагол", 3: "B1"},
    8586: {0: "ought to", 2: "модальный глагол", 3: "B1"},
    14531: {0: "o'clock"},
    14768: {0: "driver's license"},
    14769: {0: "driver's license"},
    15061: {1: "читать рэп"},
    15367: {2: "существительное"},
    21488: {1: "хранение"},
    21489: {1: "сохранение"},
    22566: {1: "бережливый"},
    22630: {1: "получать выгоду благодаря"},
    22631: {1: "получать пользу от"},
    22888: {1: "учитывать"},
    23694: {1: "относящийся к рабочему классу"},
    24534: {1: "хмурый взгляд"},
    24535: {1: "нахмуренные брови"},
    25530: {1: "добившийся успеха своими силами", 3: "C2"},
    25956: {1: "гудеть"},
    25957: {1: "напевать"},
    30409: {1: "пятнистый"},
    31122: {1: "поднимать вопрос"},
    31123: {1: "откупоривать бочку"},
    34878: {1: "с хохолком"},
    36988: {1: "смертельно уставший"},
    45119: {1: "навязывать убеждения"},
    45120: {1: "внушать идеи"},
    46250: {1: "осуждающий"},
    47482: {1: "лицензированный"},
    54729: {1: "назидательный"},
    54790: {1: "изготовленный на заводе"},
    56771: {1: "подлежащий возврату"},
    60681: {1: "снабжать шипами"},
    63939: {1: "передаваемый"},
}

deletes = {
    7830, 8585, 8586, 10108, 14809, 17192, 17335, 21298,
    22858, 23695, 23696, 24536, 25531, 25532, 25564, 25958,
    30410, 33503, 34880, 35146, 36610, 36612, 36989, 38771,
    40094, 42448, 45121, 45590, 46006, 46252, 47483, 47484,
    54730, 54791, 56503, 56772, 56793, 57522, 59217, 60682,
    62337, 63940, 63941, 65013, 65380, 66586, 67282,
}

# Both malformed "to ought" rows already exist correctly as "ought to".
for duplicate in (8585, 8586):
    del edits[duplicate]

assert source[0] == ["Слово", "Перевод", "Тип", "Сложность", "Тема"]
assert not (set(edits) & deletes)

changes = []
target = [source[0]]
for row_number, old in enumerate(source[1:], 2):
    if row_number in deletes:
        continue
    new = old.copy()
    for column, value in edits.get(row_number, {}).items():
        new[column] = value
    if new != old:
        changes.append({"row": row_number, "before": old, "after": new})
    target.append(new)

pairs = collections.Counter((row[0].casefold(), row[1].casefold(), row[2]) for row in target[1:])
assert all(count == 1 for count in pairs.values()), [p for p, c in pairs.items() if c > 1][:10]
assert all(row[0] and row[1] and row[2] and row[3] for row in target[1:])

plan = {"edits": changes,
        "deletes": [{"row": n, "before": source[n-1]} for n in sorted(deletes, reverse=True)],
        "before_count": len(source)-1, "after_count": len(target)-1,
        "unique": len({row[0].casefold() for row in target[1:]})}
(BASE / "quality-pass-next-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-next-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print(json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in plan.items() if k != "edits" or v}, ensure_ascii=False))
