import json,collections,re
from pathlib import Path
P=Path(__file__).parent
old=json.load(open(P/'pairs-assessed-uploaded.json'))
new=json.load(open(P/'pairs-assessed.json'))
old_by_source=collections.defaultdict(list)
new_by_source=collections.defaultdict(list)
for i,x in enumerate(old):old_by_source[x['source_row']].append(i)
for x in new:new_by_source[x['source_row']].append(x)
final=[x.copy() for x in old]
changes=[];added=[]
for source,indices in old_by_source.items():
 target=new_by_source[source]
 assert len(target)>=len(indices),(source,len(indices),len(target))
 for i,x in zip(indices,target):
  if final[i]['row']!=x['row']:
   final[i]=x
   changes.append({'row_index':i+1,'value':x})
 for x in target[len(indices):]:
  added.append(x)
final.extend(added)
assert len(final)==67868
assert len({x['row'][0].lower() for x in final})==50000
assert len({(x['row'][0].lower(),x['row'][1].lower(),x['row'][2]) for x in final})==len(final)
assert all(re.fullmatch('[ABC][12]',x['row'][3]) for x in final)
json.dump(changes,open(P/'followup-changes.json','w'),ensure_ascii=False)
json.dump(added,open(P/'followup-added.json','w'),ensure_ascii=False)
json.dump([['Слово','Перевод','Тип','Сложность','Тема']]+[x['row'] for x in final],open(P/'pairs-final.json','w'),ensure_ascii=False)
print(json.dumps({'changes':len(changes),'added':len(added),'rows':len(final),'unique':50000,'levels':dict(collections.Counter(x['row'][3] for x in final))},ensure_ascii=False))
