import json,collections,re,runpy,contextlib,io
from pathlib import Path
P=Path(__file__).parent
with contextlib.redirect_stdout(io.StringIO()):classifier=runpy.run_path(str(P/'pairs.py'))
assess=classifier['assess']
rows=json.load(open(P/'pairs-final-clean.json'))[1:]
meta=json.load(open(P/'pairs-assessed-uploaded.json'))+json.load(open(P/'followup-added.json'))+json.load(open(P/'polish-added.json'))
for i in [67980,67908]:del meta[i-2]
assert len(meta)==len(rows)
replacements={
 'slavery':['рабство','неволя'],
 'impatiently':['нетерпеливо'],
 'considering|предлог':['учитывая','принимая во внимание'],
 'whenever':['всякий раз когда'],
 'fine|существительное|штраф, пеня':['штраф','пеня'],
 'frequent':['частый','часто встречающийся'],
 'ever|наречие|когда-либо, когда-нибудь':['когда-либо','когда-нибудь'],
 'earth|существительное|земля, суша, почва':['земля','суша','почва'],
 'land|существительное|земля, суша':['земля','суша'],
 'astray|наречие|неправильно, сбившись с пути':['сбившись с пути','неверным путём'],
 'conspicuously':['заметно'],
 'noticeably|наречие|заметно, выдающеся':['заметно'],
 'gravitationally|наречие|под действием притяжения, тяготея':['под действием притяжения'],
 'ingratiatingly':['заискивающе'],
 'interrogatively|наречие|допрашивающе, выясняя':['с вопросительной интонацией'],
 'redundantly':['избыточно'],
 'child-free':['сознательно бездетный'],
 'crescendo':['с нарастающей силой'],
 'grower':['производитель'],
 'hesitantly':['нерешительно'],
 'home-coming':['возвращение домой','возвращение на родину'],
 'inasmuch':['ввиду того что','поскольку'],
 'lamely':['хромая'],
 'licensee':['обладатель лицензии'],
 'modeller':['создатель моделей'],
 'to operationalize':['вводить в действие'],
 'out-of-bounds|наречие|В видеоиграх - выход за пределы карты':['за пределами карты (в видеоигре)'],
 'out-of-bounds|наречие|либо прохождение сквозь стены, используя различные баги игры':['вне игровой зоны'],
 'questioner':['спрашивающий человек'],
 're|предлог|о, ссылаясь на':['в отношении'],
 'to recurve':['загибаться назад'],
 'reviver':['человек, который возрождает'],
 'screamer':['крикун'],
 'sifting':['просеивание','отсев','отсеивание'],
 'singularly':['необыкновенно','особенно'],
 'sledding|существительное|катание на санях, на салазках':['катание на санях'],
 'whereon':['на котором'],
 'wherewith':['с помощью которого'],
 'to whoosh|глагол|пронестись со свистом, с шумом (разговорное)':['пронестись со свистом'],
 'to haunt|глагол|преследовать, часто посещать':['преследовать','часто посещать'],
 'to outperform':['превосходить по результату'],
 'to outsell':['продаваться лучше конкурента'],
}
levels_override={
 ('earth','земля'):'A1',('earth','суша'):'B1',('earth','почва'):'B1',
 ('land','земля'):'A2',('land','суша'):'B1',
 ('fine','штраф'):'B1',('fine','пеня'):'B2',
 ('impatiently','нетерпеливо'):'B2',('noticeably','заметно'):'B2',
 ('grower','производитель'):'B2',('hesitantly','нерешительно'):'B2',
 ('modeller','создатель моделей'):'C1',('questioner','спрашивающий человек'):'B2',
 ('screamer','крикун'):'B2',('sledding','катание на санях'):'B1',
 ('to whoosh','пронестись со свистом'):'B2',
}
seen={(r[0].lower(),r[1].lower(),r[2]) for r in rows}
changes=[];added=[];out=[r[:] for r in rows]
for i,r in enumerate(rows):
 w,t,typ,oldlevel,theme=r
 keys=[w+'|'+typ+'|'+t,w+'|'+typ,w]
 parts=next((replacements[k] for k in keys if k in replacements),None)
 if not parts or (len(parts)==1 and parts[0]==t):continue
 seen.discard((w.lower(),t.lower(),typ))
 available=[p for p in parts if (w.lower(),p.lower(),typ) not in seen]
 assert available,(i,w,t,parts)
 for j,p in enumerate(available):
  level,method=assess(w,p,typ,oldlevel,theme)
  level=levels_override.get((w,p),level)
  if w=='fine' and p in {'штраф','пеня'}:theme='Деньги'
  if w=='whereon':typ='наречие'
  item=[w,p,typ,level,theme]
  seen.add((w.lower(),p.lower(),typ))
  if j==0:
   out[i]=item
   changes.append({'row_index':i+1,'row':item})
  else:added.append({'row':item,'note':meta[i].get('note',''),'method':method})
out.extend(x['row'] for x in added)
assert len({(r[0].lower(),r[1].lower(),r[2]) for r in out})==len(out)
assert len({r[0].lower() for r in out})==50000
assert all(re.fullmatch('[ABC][12]',r[3]) for r in out)
json.dump(changes,open(P/'manual-changes.json','w'),ensure_ascii=False)
json.dump(added,open(P/'manual-added.json','w'),ensure_ascii=False)
json.dump([['Слово','Перевод','Тип','Сложность','Тема']]+out,open(P/'pairs-final-v2.json','w'),ensure_ascii=False)
print(json.dumps({'changed':len(changes),'added':len(added),'records':len(out),'levels':dict(collections.Counter(r[3] for r in out)),'added_methods':dict(collections.Counter(x['method'] for x in added))},ensure_ascii=False))
