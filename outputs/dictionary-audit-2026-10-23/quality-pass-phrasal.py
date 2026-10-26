"""Replace verbose phrasal-verb definitions with usable Russian translations."""

import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
source = json.loads((BASE / "quality-pass-number-words-target.json").read_text(encoding="utf-8"))
translations = {
    15868: "справляться о здоровье",
    15874: "подтверждать слова",
    15877: "случайно столкнуться",
    15946: "случайно встретить",
    15970: "зайти за человеком",
    15973: "зайти в гости",
    15987: "наверстать",
    16013: "срубить",
    16020: "вычистить",
    16041: "заболеть",
    16070: "сократить расходы",
    16072: "срубить",
    16102: "задремать",
    16121: "в итоге сделать",
    16133: "упасть",
    16202: "выйти из транспорта",
    16233: "согласиться",
    16278: "подождать",
    16281: "повесить",
    16304: "выручать",
    16309: "спрятаться",
    16350: "записать",
    16379: "валяться без дела",
    16396: "не впустить",
    16398: "запереться",
    16404: "войти в систему",
    16415: "наблюдать",
    16464: "подвинуться",
    16465: "подвинуться",
    16523: "придираться",
    16555: "действовать сообща",
    16559: "убрать на место",
    16568: "позвать к телефону",
    16569: "включить",
    16609: "стереть",
    16611: "сбежать",
    16619: "спугнуть",
    16635: "послать за кем-либо",
    16651: "явиться",
    16696: "остаться",
    16708: "защищать",
    16732: "записать",
    16760: "выгнать",
    16792: "общаться",
    16796: "не ложиться спать",
    16828: "вычислить",
    18837: "рассчитывать",
    18915: "отмахнуться",
    19111: "вступить в обсуждение",
    19137: "отфильтровать",
    19323: "оставить в стороне",
    19359: "разобраться",
    19365: "выдумать",
    19399: "записать",
    19521: "лезть без очереди",
    19684: "высказаться открыто",
    19698: "уйти в отставку",
    19719: "поддерживать",
    19786: "смягчить",
    19842: "в итоге сделать",
    19843: "разыграть",
}

edits = []
target = [row.copy() for row in source]
for row_number, translation in translations.items():
    old = source[row_number-1]
    assert old[2] == "фразовый глагол", (row_number, old)
    new = old.copy()
    new[1] = translation
    if new != old:
        edits.append({"row": row_number, "before": old, "after": new})
        target[row_number-1] = new

dup = [k for k,c in collections.Counter((r[0].casefold(),r[1].casefold(),r[2]) for r in target[1:]).items() if c > 1]
assert not dup, dup[:10]
plan = {"edits": sorted(edits,key=lambda x:x['row']), "before_count": len(source)-1,
        "after_count": len(target)-1, "unique": len({r[0].casefold() for r in target[1:]})}
(BASE / "quality-pass-phrasal-plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-pass-phrasal-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print({k: len(v) if isinstance(v,list) else v for k,v in plan.items()})
