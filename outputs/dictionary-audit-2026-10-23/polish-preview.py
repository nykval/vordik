import json,re,sys,collections,random
from pathlib import Path
sys.path.insert(0,'/tmp/vordik-lexicon-libs')
import pymorphy3
P=Path(__file__).parent
rows=json.load(open(P/'pairs-final.json'))[1:]
m=pymorphy3.MorphAnalyzer()
def parts(t):
 o=[];b='';d=0;q=None
 for c in t:
  if c in '«"' and not q:q='»' if c=='«' else '"'
  elif c==q:q=None
  if c=='(':d+=1
  elif c==')':d=max(0,d-1)
  if c in ',;' and not d and not q:o.append(b.strip());b=''
  else:b+=c
 o.append(b.strip());return o
def words(t):return re.findall(r'[а-яё-]+',re.sub(r'\([^)]*\)','',t.lower()))
def pos(w):return m.parse(w)[0].tag.POS
def standalone(p,typ,part_index):
 w=words(p)
 if not w:return False
 if re.match(r'^(?:что\b|котор\w*\b|где\b|когда\b|чтобы\b|если\b|но\b|хотя\b|особенно\b|обычно\b|кто\b|чем\b|поскольку\b|откуда\b|как\b|при котором|в котором|на котор)',p):return False
 if pos(w[0]) in {'GRND','PRTS'}:return False
 if part_index and (pos(w[0])=='PRTF' or any(a.tag.POS=='PRTF' for a in m.parse(w[0]))):return False
 if pos(w[0])=='PRTF' and not any(pos(x)=='NOUN' for x in w[1:]):return False
 if typ in {'глагол','фразовый глагол'}:return any(pos(x)=='INFN' for x in w[:2])
 if typ=='существительное':return len(w)<=5 and ((pos(w[0])=='NOUN' and any('nomn' in a.tag for a in m.parse(w[0]))) or (pos(w[0]) in {'ADJF','PRTF'} and any(pos(x)=='NOUN' for x in w[1:])))
 if typ=='прилагательное':return len(w)<=6 and pos(w[0]) in {'ADJF','ADJS','PRTF','PRTS'}
 if typ=='наречие':return len(w)<=5 and (pos(w[0])=='ADVB' or w[0] in {'по','с','в','на','как','без','до'})
 if typ=='фраза':
  if pos(w[0]) in {'ADJF','ADJS','PRTF'} and not any(pos(x)=='NOUN' for x in w[1:]):return False
  if pos(w[0])=='NOUN' and not any('nomn' in a.tag for a in m.parse(w[0])):return False
  return len(w)<=6 and (pos(w[0]) in {'NOUN','ADJF','ADJS','PRTF','INFN'} or w[0] in {'в','на','с','по','при','для','без','от','из','за'})
 return False
def choose(row):
 w,t,typ,l,theme=row
 pp=parts(t)
 if len(pp)<2:return None
 if len(pp)>4:return None
 if any(len(p)>75 for p in pp):return None
 if any(not standalone(p,typ,j) for j,p in enumerate(pp)):return None
 if typ=='фраза' and len(re.findall(r"[A-Za-z]+",w))>=4 and any(p.startswith(('в ', 'на ', 'с ')) for p in pp[1:]):return None
 if any(re.search(r'\b(?:котор\w*|поскольку|однако|когда|потому что|если|чтобы)\b',p) for p in pp[1:]):return None
 if any(re.match(r'^(?:занимая|живущий|находящийся|используемый|приведший|вступающий|служащий|составляющий|содержащий|предназначенный|построенный|вызывающий|показывающий|начинающийся|указывающий|имеющий|ведущий)',p) for p in pp[1:]):return None
 if typ in {'фраза','фразовый глагол'} and any(len(words(p))>6 for p in pp):return None
 return pp
selected=[]
for i,row in enumerate(rows):
 p=choose(row)
 if p:selected.append((i+2,row,p))
if __name__=='__main__':
 print('selected',len(selected),'extra',sum(len(x[2])-1 for x in selected))
 for x in random.Random(31).sample(selected,min(100,len(selected))):print(x)
