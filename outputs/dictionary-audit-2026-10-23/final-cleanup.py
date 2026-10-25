import json,collections,re
from pathlib import Path
P=Path(__file__).parent
r=json.load(open(P/'pairs-final-polished.json'))
updates={
 29140:('ball boy','лицо мужского пола','мальчик, подающий мячи',None),
 35633:('dead tree','количество бумаги','бумажное издание',None),
 42185:('grain separator','зерноочистительная машина','зерноочистительная машина',None),
 67786:('philistine','человек','человек, равнодушный к культуре',None),
 67886:('ball boy','ответственное за поднос мячей игрокам (спорт)','подавальщик мячей',None),
 67907:('dead tree','набор бумаги','печатное издание',None),
 67921:('grain separator','сортировка (машина)','машина для сортировки зерна',None),
 67959:('rabble rouser','дирижёр толпы (человек, подстрекающий людей к мятежу)','зачинщик беспорядков',None),
 67986:('philistine','равнодушный к культуре','равнодушный к культуре','прилагательное'),
}
for i,(w,old,new,typ) in updates.items():
 assert r[i-1][0]==w and r[i-1][1]==old,(i,r[i-1])
 r[i-1][1]=new
 if typ:r[i-1][2]=typ
for i in [67980,67908]:
 assert (i==67980 and r[i-1][0]=='white shark') or (i==67908 and r[i-1][0]=='dead tree')
 del r[i-1]
assert len(r)==67984
assert len({x[0].lower() for x in r[1:]})==50000
assert len({(x[0].lower(),x[1].lower(),x[2]) for x in r[1:]})==len(r)-1
assert all(re.fullmatch('[ABC][12]',x[3]) for x in r[1:])
json.dump(r,open(P/'pairs-final-clean.json','w'),ensure_ascii=False)
print(json.dumps({'records':len(r)-1,'levels':dict(collections.Counter(x[3] for x in r[1:]))},ensure_ascii=False))
