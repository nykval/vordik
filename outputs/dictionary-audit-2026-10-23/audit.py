import json,re,sys,collections,math
from pathlib import Path
sys.path.insert(0,'/tmp/vordik-lexicon-libs')
from wordfreq import zipf_frequency
P=Path(__file__).parent
old=json.load(open(P/'before.json'));levels=['A1','A2','B1','B2','C1','C2']
pos={'n.':'существительное','adj.':'прилагательное','v.':'глагол','adv.':'наречие','prep.':'предлог','conj.':'союз','pron.':'местоимение','number':'числительное','modal v.':'модальный глагол'}
lex={};raw={}
for name in ['oxford3000','oxford5000']:
 text=(P/(name+'.txt')).read_text().replace('\xa0',' ')
 # Join wrapped continuation lines before locating the level-tagged records.
 text=re.sub(r'(?<=[,])\n',' ',text)
 for line in text.splitlines():
  m=re.match(r'^([A-Za-z][A-Za-z ()/\-\d,\']*?)\s+((?:adj\.|n\.|v\.|adv\.|prep\.|conj\.|pron\.|modal v\.|number).*)$',line)
  if not m or not re.search(r'\b[A-C][12]\b',m[2]):continue
  word=m[1].strip().lower();word=re.sub(r'\s*\([^)]*\)','',word)
  pending=[]
  for tok in re.findall(r'modal v\.|adj\.|adv\.|prep\.|conj\.|pron\.|n\.|v\.|number|[A-C][12]',m[2]):
   if tok in pos:pending.append(pos[tok])
   else:
    for typ in pending:lex[(word,typ)]=tok
    pending=[]
  raw[word]=line
json.dump({'|'.join(k):v for k,v in lex.items()},open(P/'oxford-map.json','w'),ensure_ascii=False)
def lemma(w):return re.sub(r'^to ','',w.strip().lower())
def freq(w):return zipf_frequency(w,'en')
splits={
'favorite':[('любимый','прилагательное'),('любимец','существительное')],
'gray':[('серый','прилагательное'),('серый цвет','существительное')],
'given':[('данный','прилагательное'),('учитывая','предлог')],
'might':[('мог бы','модальный глагол'),('мощь, сила','существительное')],
'plural':[('множественный','прилагательное'),('множественное число','существительное')],
'farewell':[('прощание','существительное'),('прощай','фраза')],
'farthest':[('самый дальний','прилагательное'),('дальше всего','наречие')],
'furthest':[('самый дальний','прилагательное'),('дальше всего','наречие')],
'filling':[('сытный','прилагательное'),('начинка','существительное'),('пломба (в зубе)','существительное')],
'hanging':[('висящий','прилагательное'),('повешение','существительное')],
'healing':[('целебный','прилагательное'),('заживление','существительное')],
'newborn':[('новорождённый','прилагательное'),('новорождённый ребёнок','существительное')],
'outward':[('внешний','прилагательное'),('наружу','наречие')],
'possessive':[('притяжательный (в грамматике)','прилагательное'),('собственнический (о поведении)','прилагательное'),('притяжательная форма','существительное')],
'preschool':[('дошкольный','прилагательное'),('дошкольное учреждение','существительное')],
'antivirus':[('антивирусный','прилагательное'),('антивирус','существительное')],
'captive':[('находящийся в неволе','прилагательное'),('пленник','существительное')],
'fellow':[('такой же (о принадлежности к группе)','прилагательное'),('товарищ','существительное')],
'grown-up':[('взрослый','прилагательное'),('взрослый человек','существительное')],
'hybrid':[('гибридный','прилагательное'),('гибрид','существительное')],
'mortal':[('смертный','прилагательное'),('смертный человек','существительное')],
'partisan':[('пристрастный','прилагательное'),('партизан','существительное')],
'wholesale':[('оптовый','прилагательное'),('оптовая торговля','существительное')],
'advisory':[('консультативный','прилагательное'),('официальное предупреждение','существительное')],
'chill':[('прохладный','прилагательное'),('озноб','существительное')],
'demographic':[('демографический','прилагательное'),('демографическая группа','существительное')],
'eccentric':[('эксцентричный','прилагательное'),('чудак','существительное')],
'elastic':[('эластичный','прилагательное'),('резинка','существительное')],
'elitist':[('элитарный','прилагательное'),('сторонник элитарности','существительное')],
'gourmet':[('изысканный (о еде)','прилагательное'),('гурман','существительное')],
'repellant':[('отталкивающий','прилагательное'),('репеллент (средство от насекомых)','существительное')],
'slack':[('небрежный','прилагательное'),('слабина (верёвки или троса)','существительное')],
'staple':[('основной','прилагательное'),('скоба','существительное'),('основной продукт питания','существительное')],
'stray':[('бродячий','прилагательное'),('бездомное животное','существительное')],
'subordinate':[('подчинённый','прилагательное'),('подчинённый сотрудник','существительное')],
'succulent':[('сочный','прилагательное'),('суккулент (растение, накапливающее воду)','существительное')],
'telltale':[('выдающий (скрываемую информацию)','прилагательное'),('доносчик','существительное')],
'violet':[('фиолетовый','прилагательное'),('фиалка','существительное')],
'derelict':[('заброшенный','прилагательное'),('заброшенный объект','существительное')],
'intermediary':[('посреднический','прилагательное'),('посредник','существительное')],
'materialist':[('материалистический','прилагательное'),('материалист','существительное')],
'philistine':[('невежественный','прилагательное'),('человек, равнодушный к культуре','существительное')],
'retrospective':[('ретроспективный (обращённый к прошлому)','прилагательное'),('ретроспектива (обзор работ разных лет)','существительное')]
}
fixes={'kerb':'бордюр','zoology':'зоология (наука о животных)','zoologist':'зоолог','wordsmith':'мастер слова','wordage':'количество слов','slow':'замедлять','lightness':'лёгкость','porosity':'пористость','ligament':'связка (анатомия)','body shop':'кузовная мастерская','selfie stick':'палка для селфи','hot dog':'хот-дог (сосиска в булочке)'}
# Meaning-specific editorial estimates; no claim of official certification.
expert={('might','модальный глагол'):'A2',('might','существительное'):'C1',('favorite','прилагательное'):'A1',('favorite','существительное'):'B1',('gray','прилагательное'):'A1',('gray','существительное'):'A2',('given','предлог'):'B2',('plural','существительное'):'A2',('farewell','существительное'):'B2',('farthest','прилагательное'):'B1',('farthest','наречие'):'B1',('filling','прилагательное'):'B2',('filling','существительное'):'B2',('succulent','существительное'):'C1',('violet','прилагательное'):'B1',('violet','существительное'):'B2'}
easyphrases={'good morning':'A1','good night':'A1','thank you':'A1','excuse me':'A1','how are you':'A1','see you tomorrow':'A1','happy birthday':'A1','nice to meet you':'A1','what do you mean':'A2','my name is':'A1','day off':'A2','hot dog':'A2','ice cream':'A1','seat belt':'B1','nail polish':'B1','tooth fairy':'B2','ab initio':'C2','alpha helix':'C1','absolute zero':'B2'}
out=[];changes=[];review=[];originalrows=[]
for idx,r in enumerate(old[1:],2):
 w,t,typ,lev,theme=r;w=re.sub(r'\s+',' ',w).strip();t=re.sub(r'\s+',' ',t).strip();t=re.sub(r',\s*',', ',t)
 # Remove repeated alternatives only, never remove context blindly.
 parts=re.split(r',\s*(?![^()]*\))',t);t=', '.join(dict.fromkeys(parts))
 wkey=lemma(w)
 if wkey in fixes and (wkey!='slow' or typ in {'глагол','фразовый глагол'}):t=fixes[wkey]
 rows=[[w,t,typ,lev,theme]]
 if ';' in typ and wkey in splits:rows=[[w,tr,tp,lev,theme] for tr,tp in splits[wkey]]
 for row in rows:
  w,t,typ,lev,theme=row;k=lemma(w)
  if typ in {'глагол','фразовый глагол'} and not w.startswith('to '):row[0]='to '+w
  if typ=='модальный глагол' and w.startswith('to '):row[0]=w[3:]
  if typ not in {'глагол','фразовый глагол','фраза'} and w.startswith('to '):row[0]=w[3:]
  if k=='porosity':row[2]='существительное';typ=row[2]
  baseline=lex.get((k,typ))
  why=''
  if (k,typ) in expert:level=expert[(k,typ)];why='Редакторская предварительная оценка конкретного значения и типа.'
  elif k in easyphrases:level=easyphrases[k];why='Редакторская предварительная оценка выражения целиком.'
  elif baseline:
   level=baseline;why='Ориентир Oxford 3000/5000: совпали слово и часть речи. Уровень именно этого значения отдельно не подтверждён.'
  else:
   # A screening estimate, explicitly not an expert/official CEFR judgement.
   z=freq(k);score=2 if z>=5 else 3 if z>=4 else 4 if z>=2.8 else 5
   domain=bool(set(theme.split('; '))&{'Биология','Химия','Физика и астрономия','Математика','Философия','Язык и речь'}) or bool(re.search('анатом|медицин|геолог|биолог|техничес|граммат|химия|физика',t))
   if domain:score=max(score,3)
   if ' ' in k:
    component=[]
    for part in k.split():
     vals=[levels.index(l) for (word,pos),l in lex.items() if word==part]
     component.append(min(vals) if vals else (3 if freq(part)>=4 else 4 if freq(part)>=2.8 else 5))
    score=max(component)
    if typ in {'фраза','фразовый глагол'}:score=max(2,min(5,score+int(not domain)))
   level=levels[score];why='Автоматическая предварительная оценка: частотность английской единицы, сложность компонентов и специальная область. Требует редакторской проверки значения; не подтверждённый CEFR.'
  row[3]=level+' (оценка)'
  note=why+'\nПеревод: '+t+'\nДо проверки: '+(lev or 'пусто')+'.'
  if baseline:note+='\nhttps://www.oxfordlearnersdictionaries.com/about/wordlists/oxford3000-5000'
  issues=[]
  if len(re.split(r',\s*(?![^()]*\))',t))>2:issues.append('Несколько переводов: отделить синонимы от разных значений')
  if not theme:issues.append('Проверить тематическую принадлежность')
  if re.search(r'\([^)]*(?:ть|ться|ти|чь)(?:, [^)]*)?\)',t):issues.append('Проверить: в скобках контекст или повтор перевода')
  if len(t)>90:issues.append('Длинный перевод: нужна редактура')
  if ';' in typ:issues.append('Смешанные типы')
  if issues:review.append([len(out)+2,w,t,'; '.join(issues)])
  originalrows.append(idx);out.append({'row':row,'note':note,'source_row':idx,'baseline':bool(baseline),'method':'редакторская' if k in easyphrases or (k,typ) in expert else 'Oxford (по слову и типу)' if baseline else 'автоматическая'})
  if row[:3]+row[4:]!=r[:3]+r[4:]:changes.append({'source_row':idx,'before':r,'after':row})
# Exact duplicate meanings are merged with their themes; levels are estimates of that same meaning.
seen={};dedup=[];merged=0
for x in out:
 r=x['row'];key=(r[0].lower(),r[1].lower(),r[2])
 if key in seen:
  previous=dedup[seen[key]]['row'];previous[4]='; '.join(sorted(set(filter(None,(previous[4]+'; '+r[4]).split('; ')))))
  merged+=1;continue
 seen[key]=len(dedup);dedup.append(x)
out=dedup
for i in range(0,len(out),1000):json.dump(out[i:i+1000],open(P/f'write-{i//1000:02}.json','w'),ensure_ascii=False)
json.dump(out,open(P/'assessed.json','w'),ensure_ascii=False);json.dump(changes,open(P/'changes.json','w'),ensure_ascii=False);json.dump(review,open(P/'review.json','w'),ensure_ascii=False)
summary={'before':len(old)-1,'after':len(out),'split_source_rows':sum(';' in r[2] for r in old[1:]),'merged':merged,'changed_content_rows':len(changes),'levels':dict(collections.Counter(x['row'][3] for x in out)),'methods':dict(collections.Counter(x['method'] for x in out)),'review_flags':len(review),'oxford_pairs':len(lex)}
json.dump(summary,open(P/'summary.json','w'),ensure_ascii=False);print(json.dumps(summary,ensure_ascii=False))
