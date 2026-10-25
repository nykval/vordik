# -*- coding: utf-8 -*-
"""Prepare the second translation cleanup against the verified live snapshot."""
import collections
import json
from pathlib import Path

BASE = Path(__file__).parent
rows = json.loads((BASE / "quality-target.json").read_text(encoding="utf-8"))
translations = {}
for line in (BASE / "quality-round2-2026-10-25.tsv").read_text(encoding="utf-8").splitlines():
    number, value = line.split("\t", 1)
    number = int(number)
    assert number not in translations
    translations[number] = value
headwords = {
    18990: "to get caught up in sth",
    19120: "to be dotted around",
    19413: "to be mixed up in",
}
edits, deletes, target = [], [], [rows[0]]
for number, original in enumerate(rows[1:], 2):
    updated = original.copy()
    if number in translations:
        if translations[number] == "DELETE":
            deletes.append(number)
            continue
        updated[1] = translations[number]
    if number in headwords:
        updated[0] = headwords[number]
    if updated != original:
        edits.append({"row": number, "before": original, "after": updated})
    target.append(updated)
keys = collections.Counter((r[0], r[1], r[2]) for r in target[1:])
duplicates = [key for key, n in keys.items() if n > 1]
print("duplicates", duplicates[:30])
print("counts", {"edits": len(edits), "deletes": len(deletes), "rows": len(target)-1,
                 "unique": len({r[0] for r in target[1:]}), "long_50": sum(len(r[1]) >= 50 for r in target[1:])})
if duplicates or len({r[0] for r in target[1:]}) != 50000:
    raise SystemExit(1)
(BASE / "round2-edits.json").write_text(json.dumps(edits, ensure_ascii=False), encoding="utf-8")
(BASE / "round2-deletes.json").write_text(json.dumps(sorted(deletes, reverse=True)), encoding="utf-8")
(BASE / "round2-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
