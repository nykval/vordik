# -*- coding: utf-8 -*-
import collections
import json
from pathlib import Path

base = Path(__file__).parent
rows = json.loads((base / "round2-target.json").read_text(encoding="utf-8"))
fixes = {}
for line in (base / "quality-round3-2026-10-25.tsv").read_text(encoding="utf-8").splitlines():
    row, translation = line.split("\t", 1)
    fixes[int(row)] = translation
edits, deletes, target = [], [], [rows[0]]
for number, old in enumerate(rows[1:], 2):
    if fixes.get(number) == "DELETE":
        deletes.append(number)
        continue
    new = old.copy()
    if number in fixes:
        new[1] = fixes[number]
    if new != old:
        edits.append({"row": number, "before": old, "after": new})
    target.append(new)
duplicates = [key for key, count in collections.Counter((r[0],r[1],r[2]) for r in target[1:]).items() if count > 1]
unique = len({r[0] for r in target[1:]})
print({"edits":len(edits),"deletes":len(deletes),"rows":len(target)-1,"unique":unique,"duplicates":duplicates[:10]})
if duplicates or unique != 50000:
    raise SystemExit(1)
(base / "round3-edits.json").write_text(json.dumps(edits, ensure_ascii=False), encoding="utf-8")
(base / "round3-deletes.json").write_text(json.dumps(sorted(deletes, reverse=True)), encoding="utf-8")
(base / "round3-target.json").write_text(json.dumps(target, ensure_ascii=False), encoding="utf-8")
