import json,re,collections
from pathlib import Path
P=Path(__file__).parent
pool=json.load(open(P/'pool.json'));old=json.load(open(P/'current.json'))
existing={re.sub('^to ','',x[0].lower()) for x in old[1:]}
posmap={'n':'существительное','a':'прилагательное','v':'глагол','adv':'наречие','prep':'предлог','cj':'союз','pron':'местоимение','n-card':'числительное','n-ord':'числительное'}
labels={}
for line in open(P/'mueller.txt'):
 if line.startswith('_'):
  m=re.match(r'_([а-яё-]+)\.\s+(.*)',line)
  if m:labels[m[1]]=m[2].strip()
added=0
for line in open(P/'mueller.txt'):
 bits=line.rstrip().split('  ',1)
 if len(bits)<2:continue
 w,body=bits
 if not re.fullmatch("[a-z][a-z '-]*[a-z]",w) or w in existing:continue
 splits=re.split(r'_(n|a|v|adv|prep|cj|pron|n-card|n-ord)\.',body)
 for i in range(1,len(splits),2):
  pos=splits[i];s=splits[i+1]
  s=re.split(r'\s_II|\s_III|\s_IV|\s_V\b|\s2>|\s2\.',s)[0]
  if re.search(r'_(уст|редк|диал|груб|жарг|презр|пренебр|шотл|сокр)\.',s):continue
  cats=[labels.get(z,z) for z in re.findall(r'_([а-яё-]+)\.',s)]
  s=re.sub(r'\([^)]*[A-Za-z][^)]*\)','',s)
  s=re.sub(r'_[\w-]+[.:]?','',s)
  s=re.sub(r'\[[^]]*\]','',s)
  s=re.sub(r'^\s*(?:\d+[>.]|[а-я]>|[.,:;])\s*','',s).strip()
  s=re.split(r';|\b[A-Za-z]',s)[0].strip()
  s=re.sub(r'\s+',' ',s).strip(' ,;.:')
  if not 1<len(s)<130 or not re.search('[а-яё]',s) or re.search(r'[0-9_=>\[\]]|см\.|гл\.|сущ\.|мн\.|употр\.|в знач\.|от |мужское имя|женское имя',s):continue
  if s.count('(')!=s.count(')'):continue
  s=s.replace('тж.','также').replace('обыкн.','обычно').replace('особ.','особенно')
  pool.setdefault(w,[]).append({'word':w,'type':posmap[pos],'source':'Мюллер / GNU GPL','senses':[[s,cats]],'cats':cats});added+=1
json.dump(pool,open(P/'pool.json','w'),ensure_ascii=False)
print('Mueller candidates',added,'new pool',len(pool))
