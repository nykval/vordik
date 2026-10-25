import json,collections,re
from pathlib import Path
P=Path(__file__).parent
old=json.load(open(P/'before.json'));a=json.load(open(P/'assessed.json'))
extra={'airplane':('A1',None),'bottle opener':('A2',None),'bedtime':('A2',None),'softly':('B1',None),'snoring':('B2',None),'white hole':('C1','белая дыра (гипотетический космический объект)'), 'bouillon':('B2','бульон'),'baffle':('C1','озадачивать'),'plasticine':('B2','пластилин'),'alarmist':('C1','паникёр'),'drainage basin':('C1','водосборный бассейн'),'meandering':('C1','извилистый'),'gravitation':('B2','гравитация, тяготение'),'stunt double':('B2','каскадёр-дублёр'),'safe house':('B2','убежище (тайное безопасное место)'), 'headword':('C1','заглавное слово словарной статьи'),'saber saw':('C1','сабельная пила')}
seen=set();append=[];patch=[];full=[r+['']*(5-len(r)) for r in old];methods=collections.Counter()
for x in a:
 r=x['row'];source=x['source_row'];k=re.sub('^to ','',r[0]);note=x['note']
 if k in extra:
  lvl,tr=extra[k];r[3]=lvl+' (оценка)'
  if tr:r[1]=tr
  x['method']='редакторская';note='Предварительная редакторская оценка конкретного значения; не подтверждённый источник CEFR. Перевод: '+r[1]
 if x['method']=='автоматическая':
  previous=old[source-1][3]
  r[3]=previous+' (не проверен)' if re.fullmatch('[ABC][12]',previous) else 'Не определён'
  note='Уровень конкретного значения не установлен. Частотный расчёт отклонён как недостаточно надёжный. '+('Исходный уровень: '+previous if previous!='Не определён' else '')
 methods[x['method']]+=1
 if source in seen:
  target=len(old)+len(append);append.append({'row':r,'note':note,'source_row':source});full.append(r)
 else:
  seen.add(source);target=source-1;full[target]=r
 if source not in seen:raise RuntimeError()
 patch.append({'target':target,'row':r,'note':note,'source_row':source,'content_changed':r[:3]+r[4:]!=old[source-1][:3]+old[source-1][4:]})
for i in range(0,len(patch),1000):json.dump(patch[i:i+1000],open(P/f'safe-{i//1000:02}.json','w'),ensure_ascii=False)
json.dump(full,open(P/'after-safe.json','w'),ensure_ascii=False)
summary={'records':len(full)-1,'new_rows':len(append),'methods':dict(methods),'levels':dict(collections.Counter(r[3] for r in full[1:])), 'content_changed':sum(x['content_changed'] for x in patch)}
json.dump(summary,open(P/'safe-summary.json','w'),ensure_ascii=False);print(json.dumps(summary,ensure_ascii=False))
