# -*- coding: utf-8 -*-
"""Build a reviewed, index-safe edit plan for the live dictionary."""
import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
rows = json.loads((BASE / "pairs-final-v2.json").read_text(encoding="utf-8"))
assert rows[0] == ["Слово", "Перевод", "Тип", "Сложность", "Тема"]

translations = {}
for name in ("quality-pass-2026-10-25.tsv", "quality-medium-2026-10-25.tsv"):
    for line in (BASE / name).read_text(encoding="utf-8").splitlines():
        row_number, value = line.split("\t", 1)
        row_number = int(row_number)
        assert 2 <= row_number <= len(rows)
        if row_number in translations:
            raise ValueError((name, row_number))
        translations[row_number] = value

headwords = {
    19705: "to skimp on sth",
    19050: "could do without sth",
    19051: "couldn't ask for sb/sth",
}
types = {19050: "фраза", 19051: "фраза"}
levels = {31375: "B2"}

edits = []
deletes = []
target = [rows[0]]
for number, original in enumerate(rows[1:], 2):
    desired = original.copy()
    if number in translations:
        if translations[number] == "DELETE":
            deletes.append(number)
            continue
        desired[1] = translations[number]
    if number in headwords:
        desired[0] = headwords[number]
    if number in types:
        desired[2] = types[number]
    if number in levels:
        desired[3] = levels[number]
    if desired != original:
        edits.append({"row": number, "before": original, "after": desired})
    target.append(desired)

keys = [(r[0], r[1], r[2]) for r in target[1:]]
counts = collections.Counter(keys)
duplicates = [k for k, n in counts.items() if n > 1]
assert not duplicates, duplicates[:10]
assert len({r[0] for r in target[1:]}) == 50000
assert all(r[0] and r[1] and r[2] and r[3] in {"A1", "A2", "B1", "B2", "C1", "C2"} for r in target[1:])

(BASE / "quality-edits.json").write_text(json.dumps(edits, ensure_ascii=False), encoding="utf-8")
(BASE / "quality-deletes.json").write_text(json.dumps(sorted(deletes, reverse=True)), encoding="utf-8")
(BASE / "quality-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
print(json.dumps({"edits": len(edits), "deletes": len(deletes), "rows": len(target)-1,
                  "unique": len({r[0] for r in target[1:]}), "duplicates": len(duplicates),
                  "long": sum(len(r[1]) >= 60 for r in target[1:])}, ensure_ascii=False))
