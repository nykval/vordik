import json,runpy,contextlib,io,re,collections
from pathlib import Path
P=Path(__file__).parent
preview=runpy.run_path(str(P/'polish-preview.py'))
with contextlib.redirect_stdout(io.StringIO()):classifier=runpy.run_path(str(P/'pairs.py'))
assess=classifier['assess']
current=json.load(open(P/'pairs-final.json'))[1:]
meta=json.load(open(P/'pairs-assessed-uploaded.json'))+json.load(open(P/'followup-added.json'))
assert len(current)==len(meta)
skip={
 'to burst into sth','fiduciary duty',"knocking on heaven's door",'seller\'s market',
 'inside track','to mouth off','rara avis','brick and mortar','sexual inadequacy',
 'to set sth up','jack of all trades','organized religion','tour de force','inner tube',
 'dead man','to burst into sth','to kick feet up','to put feet up','to drag on',
 'to fall down','to swell up','to insist on','to live for sth/sb','take a fall',
 'to blast off','to haunt','to kit out','to photo opportunity','photo spread',
 'sister language','sliding seat','to set sth up','go dark',
}
manual={
 'to set sth up':['основать компанию или организацию','подготовить что-либо к использованию'],
 'to drag on':['затягиваться','длиться слишком долго'],
 'to fall down':['провалиться','не справиться'],
 'to swell up':['опухать','увеличиваться'],
 'to insist on':['настаивать на чём-либо','требовать чего-либо'],
 'to live for sth/sb':['жить ради кого-либо или чего-либо','считать что-либо самым важным'],
 'take a fall':['быть арестованным','быть обвинённым в преступлении'],
 'to blast off':['взлетать (о ракете)','стартовать (о ракете)'],
 'to haunt':['преследовать','часто посещать'],
 'to kit out':['снабжать экипировкой','обставлять мебелью','оснащать оборудованием'],
 'photo opportunity':['удобный момент для фотосъёмки','позирование перед прессой'],
 'photo spread':['фотографии на развороте'],
 'sister language':['родственный язык'],
 'sliding seat':['подвижное сиденье в гоночной лодке'],
 'go dark':['приостановить деятельность','закрыться'],
 'organized religion':['организованная религия'],
 'jack of all trades':['мастер на все руки'],
 'tour de force':['виртуозное достижение'],
 'inner tube':['камера колеса'],
 'dead man':['аварийный выключатель'],
 'to kick feet up':['расслабиться','отдыхать'],
 'to put feet up':['расслабиться','отдыхать'],
 'sexual inadequacy':['сексуальная дисфункция'],
 'rara avis':['редкость','диковина'],
 'brick and mortar':['обычный магазин (в отличие от интернет-магазина)'],
}
actions={}
for idx,row,parts in preview['selected']:
 if row[0] in skip:continue
 actions[idx-2]=parts
for i,row in enumerate(current):
 if row[0] in manual and (',' in row[1] or ';' in row[1]):actions[i]=manual[row[0]]
for i,parts in actions.items():
 actions[i]=[re.sub(r'^либо\s+','',p.strip(),flags=re.I).strip() for p in parts]
seen={(r[0].lower(),r[1].lower(),r[2]) for r in current}
changes=[];added=[];output=[r[:] for r in current]
methods=collections.Counter(x.get('method','assessed') for x in meta)
for i,parts in sorted(actions.items()):
 row=current[i];w,t,typ,oldlevel,theme=row
 if len(parts)==1 and parts[0]==t:continue
 seen.discard((w.lower(),t.lower(),typ))
 for j,tr in enumerate(parts):
  if not tr:continue
  key=(w.lower(),tr.lower(),typ)
  if key in seen:continue
  level,method=assess(w,tr,typ,oldlevel,theme)
  item=[w,tr,typ,level,theme]
  seen.add(key)
  if j==0:
   output[i]=item
   methods[meta[i].get('method','assessed')]-=1
   methods[method]+=1
   changes.append({'row_index':i+1,'row':item})
  else:
   added.append({'row':item,'note':meta[i].get('note','')})
   methods[method]+=1
output.extend(x['row'] for x in added)
assert len({(r[0].lower(),r[1].lower(),r[2]) for r in output})==len(output)
assert len({r[0].lower() for r in output})==50000
assert all(re.fullmatch('[ABC][12]',r[3]) for r in output)
json.dump(changes,open(P/'polish-changes.json','w'),ensure_ascii=False)
json.dump(added,open(P/'polish-added.json','w'),ensure_ascii=False)
json.dump([['Слово','Перевод','Тип','Сложность','Тема']]+output,open(P/'pairs-final-polished.json','w'),ensure_ascii=False)
print(json.dumps({'changed':len(changes),'added':len(added),'rows':len(output),'levels':dict(collections.Counter(r[3] for r in output)),'methods':dict(methods)},ensure_ascii=False))
