import json,re,unicodedata,collections,xml.etree.ElementTree as ET,random
from pathlib import Path
P=Path(__file__).parent
def clean(t):
 t=unicodedata.normalize('NFC',t).replace('\u0301','').replace('\u00ad','')
 t=re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]+)\]\]',r'\1',t)
 return re.sub(r'\s+',' ',t).strip()
def key(w): return re.sub(r'^to ','',clean(w).lower()).replace('’',"'")
old=json.load(open(P/'current.json'))
existing={key(x[0]) for x in old[1:]}
posmap={'noun':'существительное','n':'существительное','adj':'прилагательное','verb':'глагол','v':'глагол','adv':'наречие','phrase':'фраза','phraseologicalUnit':'фраза','abbrev':'сокращение','num':'числительное','numeral':'числительное','prep':'предлог','preposition':'предлог','pron':'местоимение','pronoun':'местоимение','conj':'союз','conjunction':'союз'}
pool=collections.defaultdict(list)
def goodword(w):
 return bool(re.fullmatch(r"[A-Za-z][A-Za-z '\-’]*[A-Za-z]",w)) and len(w)<65 and len(w.split())<=7 and key(w) not in existing
def goodtrans(t):
 return 1<len(t)<=130 and bool(re.search('[а-яё]',t,re.I)) and not re.search(r'[A-Za-z{}\[\]<>#=|/]|\?\?|◆|значение отсутствует|см\.|форма |фамилия|мужское имя|женское имя|сокращение от|вариант написания',t,re.I)
def translation(t):
 t=clean(t).strip(' .;:,')
 t=re.sub(r'[,;]\s*',', ',t)
 # Imperfective/perfective synonym in brackets is not context.
 t=re.sub(r'(?<=[а-яё])\s*\(([а-яё]+(?:ть|ться|ти|тись|чь|чься))\)', '', t)
 return t
badstyle=r'устар|редк|диал|обсц|вульг|бран|истор|неол|архаич'
catsbyword={}
for line in open(P/'kaikki-en-ru.jsonl'):
 x=json.loads(line);w=clean(x['word']);pos=x['pos'];cats=[c['name'] for c in x.get('categories',[])]
 catsbyword.setdefault(key(w),set()).update(cats)
 if not goodword(w) or pos not in posmap or re.search(r'фамили|имена|Имена собственные|Топонимы|Формы |Словоформы', ' '.join(cats)):continue
 if w[:1].isupper() and pos!='abbrev':continue
 typ=posmap[pos]
 if 'Английские фразовые глаголы' in cats:typ='фразовый глагол'
 senses=[]
 for s in x.get('senses',[]):
  scats=[c['name'] for c in s.get('categories',[])]
  if set(s.get('tags',[]))&{'form-of','obsolete','dialectal','no-gloss','archaic'}:continue
  if re.search(badstyle,' '.join(scats+s.get('raw_tags',[])),re.I):continue
  for g in s.get('glosses',[]):
   t=translation(g)
   if goodtrans(t):senses.append((t,scats))
 if senses:pool[key(w)].append({'word':w,'type':typ,'source':'Русский Викисловарь / Kaikki','senses':senses,'cats':cats})
ns={'t':'http://www.tei-c.org/ns/1.0'}
for x in ET.parse(P/'eng-rus.tei').findall('.//t:entry',ns):
 w=clean(x.findtext('t:form/t:orth',namespaces=ns));pos=x.findtext('t:gramGrp/t:pos',namespaces=ns)
 if not goodword(w) or pos not in posmap or w[0].isupper():continue
 senses=[]
 for s in x.findall('t:sense',ns):
  defs=' '.join(d.text or '' for d in s.findall('.//t:def',ns))
  if re.search(r'\b(archaic|obsolete|rare|dated|offensive|derogatory|vulgar|eye dialect|misspelling|alternative spelling|alternative form|plural of|past participle of|simple past|present participle|surname|given name)\b',defs,re.I):continue
  ts=[translation(t.text or '') for t in s.findall('t:cit/t:quote',ns)]
  ts=[t for t in ts if goodtrans(t)]
  if ts:senses.append((ts[0],re.findall(r'^\(([^)]+)\)',defs)))
 if senses:pool[key(w)].append({'word':w,'type':posmap[pos],'source':'FreeDict / WikDict','senses':senses,'cats':list(catsbyword.get(key(w),[]))})
json.dump(pool,open(P/'pool.json','w'),ensure_ascii=False)
print('current unique',len({r[0].lower() for r in old[1:]}),'new candidate keys',len(pool))
print('source',collections.Counter(tuple(sorted(set(x['source'] for x in xs))) for xs in pool.values()))
random.seed(501)
for k in random.sample(list(pool),min(100,len(pool))):
 xs=pool[k];print(k,'|',xs[0]['type'],'|',xs[0]['senses'][:2])
