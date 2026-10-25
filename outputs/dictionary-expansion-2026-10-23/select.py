import sys,json,re,collections,random,functools
from pathlib import Path
sys.path.insert(0,'/tmp/vordik-lexicon-libs')
from wordfreq import zipf_frequency
import pymorphy3
P=Path(__file__).parent
morph=pymorphy3.MorphAnalyzer()
@functools.lru_cache(None)
def parses(w):return morph.parse(w)
@functools.lru_cache(None)
def known(w):return morph.word_is_known(w)
@functools.lru_cache(None)
def freq(w,lang):return zipf_frequency(w,lang)
topics=[
 ('Тело и здоровье',r'медицин|анатом|психиатр|физиолог|хирург|патолог|фарм|болезн|врач|здоров|организм|кровь|medicine|anatomy|pathology|psychiatry|surgery|disease|physiology|dentistry|pharmaceutical|virology|immunology'),
 ('Животные',r'зоолог|орнитолог|энтомолог|ихтиолог|животн|птиц|насеком|рыбы|млекопита|zoology|ornithology|entomology|ichthyology'),
 ('Природа',r'ботан|растени|цветы|деревья|метеоролог|геолог|географ|минерал|гидрол|эколог|почв|погод|botany|geology|geography|ecology|meteorology|mineralogy|mycology|hydrology'),
 ('Биология',r'биолог|биохим|цитолог|генет|гистолог|микробиолог|biology|biochemistry|cytology|genetics|histology'),
 ('Химия',r'химич|химии|металл|соли/|chemistry|chemical|organic compound|inorganic compound'),
 ('Физика и астрономия',r'физическ|астроном|оптичес|электрич|physics|astronomy|astrophysics|optics'),
 ('Математика',r'математ|геометр|статистич|числа/|mathematics|maths|geometry|statistics|algebra|arithmetic'),
 ('Технологии',r'техническ|компьютер|информат|программ|электрон|прибор|инструмент|computing|computer|programming|internet|engineering|electronics'),
 ('Язык и речь',r'лингвист|филолог|граммат|фонет|письмен|linguistics|grammar|phonetics|phonology|orthography'),
 ('Искусство и медиа',r'музык|искусств|полиграф|театрал|кинемат|фотограф|живопис|худож|литератур|music|art\b|printing|photography|film|theatre|literature|poetry'),
 ('Спорт и игры',r'спортив|шахмат|карт[ыо]|игры/|спортсмен|sports|chess|card games|gaming|football|cricket|baseball|tennis'),
 ('Деньги',r'финансов|экономич|бухгалтер|деньги|монеты|банков|бирже|finance|economics|banking|accounting|currency'),
 ('Работа',r'професси|должност|труд|управлен|предприним|бизнес|business|management|occupation'),
 ('Покупки',r'торгов|реклам|маркетинг|торг\.|trade|commerce|marketing|retail'),
 ('Еда и напитки',r'кулинар|гастроном|пищев|питани|напит|продукты пит|кухня|cooking|cuisine|food|beverage|culinary'),
 ('Одежда',r'одежд|текстиль|швейн|ткани/|обувь|головные уборы|textile|clothing|fashion|sewing'),
 ('Путешествия',r'авиацион|морские|морск|автомобил|транспорт|железнодор|туриз|судоход|корабли|aviation|nautical|automotive|railways|travel|transport|tourism'),
 ('Политика',r'политич|государств|выборы|правительств|politics|government|diplomacy'),
 ('Право',r'юридич|право/|закон|legal|law\b|jurisprudence'),
 ('Религия и мифология',r'религи|мифолог|церков|библей|religion|mythology|christianity|islam|buddhism|judaism|theology'),
 ('Философия',r'философ|philosophy|logic'),
 ('Образование',r'образован|обучен|учеб|учащие|education|pedagogy'),
 ('Отношения',r'родств|семья|супруг|брак/|дружб|kinship|family'),
 ('Характер человека',r'характер|эмоци|психолог|качества человека|плохие люди|хорошие люди|psychology|emotion'),
 ('Внешность человека',r'внешност|причёск|космет|волосы|cosmetics'),
 ('Общение',r'глаголы речи|общени|приветств|этикет|communication'),
 ('Действия человека',r'глаголы бега|глаголы труд|глаголы физическ|глаголы созидани|глаголы еды|глаголы ходьбы'),
 ('Сельское хозяйство',r'сельскохозяй|садовод|agriculture|horticulture|farming'),
 ('История и общество',r'историческ|социолог|этнограф|археолог|history|historical|sociology|ethnology|archaeology'),
]
labels={'мед':'медицина','анат':'анатомия','техн':'техника','биол':'биология','хим':'химия','физ':'физика','лингв':'лингвистика','ботан':'ботаника','воен':'военное дело','матем':'математика','зоол':'зоология','муз':'музыка','биохим':'биохимия','юр':'право','религ':'религия','комп':'информатика','полит':'политика','спорт':'спорт','геол':'геология','геометр':'геометрия','морск':'морское дело','экон':'экономика','физиол':'физиология','минер':'минералогия','астрон':'астрономия','филос':'философия','психол':'психология','психиатр':'психиатрия','орнитол':'орнитология','филол':'филология','авиац':'авиация','информ':'информатика','фин':'финансы','грам':'грамматика','искусств':'искусство','полигр':'полиграфия','церк':'религия','геогр':'география','кулин':'кулинария','генет':'генетика','мифол':'мифология','фарм':'фармацевтика','энтомол':'энтомология','текст':'текстиль','горн':'горное дело','металл':'металлургия','ихтиол':'ихтиология','метеорол':'метеорология','эл':'электротехника','карт':'карточные игры','цитол':'цитология','библейск':'религия','театр':'театр','шахм':'шахматы','палеонт':'палеонтология','автомоб':'автомобили','фотогр':'фотография','микол':'микология','нефтегаз':'нефтегазовая отрасль','микробиол':'микробиология','вет':'ветеринария','бот':'ботаника','торг':'торговля','гастрон':'кулинария','опт':'оптика','прогр':'программирование','этногр':'этнография','гидрол':'гидрология','бухг':'бухгалтерия','рекл':'реклама','гистол':'гистология','игр':'игры','социол':'социология','швейн':'швейное дело','рыбол':'рыболовство','бирж':'биржа','археол':'археология','радио':'радиотехника','астр':'астрономия','интернет':'интернет','стат':'статистика','геод':'геодезия','типогр':'типография','космет':'косметика','экол':'экология','сексол':'сексология','охотн':'охота','строит':'строительство','архит':'архитектура'}
style={'разг':'разговорное','жарг':'жаргон','книжн':'книжное','поэт':'поэтическое','перен':'переносное значение','прост':'просторечие','шутл':'шутливое','детск':'детская речь','ирон':'ирония','неодобр':'неодобрительное','груб':'грубое'}
skipmarkers={'амер','брит','спец','ирл','ам','мн','собир','неисч','перех','неперех','австрал'}
def normalize(t):
 tags=[]
 while True:
  m=re.match(r'^([а-яё-]+)\.\s*',t)
  if not m:break
  mark=m[1]
  if mark in labels:tags.append(labels[mark])
  elif mark in style:tags.append(style[mark])
  elif mark not in skipmarkers:return None,[]
  t=t[m.end():].lstrip(' ,;')
 if re.search(r'\b(устар|редк|диал|обсц|бран|пренебр|презр)\.',t):return None,[]
 if re.search(r'\b[а-яё]{1,8}\.',t) and not re.search(r'т\.\s*п\.|т\.\s*д\.|кого-л\.|чего-л\.|что-л\.|чем-л\.|какой-л\.',t):return None,[]
 t=t.replace('что-л.','что-либо').replace('чего-л.','чего-либо').replace('кого-л.','кого-либо').replace('чем-л.','чем-либо')
 t=re.sub(r'т\.\s*п\.','тому подобное',t);t=re.sub(r'т\.\s*д\.','так далее',t)
 if re.search(r'\b(вариант|множественное число|прошедшее время|причастие|сравнительная степень|превосходная степень|то же, что)\b',t):return None,[]
 parts=re.split(r',\s*(?![^()]*\))',t)
 t=', '.join(dict.fromkeys(parts[:3]))
 if t.count('(')!=t.count(')'):return None,[]
 return t,tags
def morphok(t,typ):
 words=re.findall('[а-яё-]+',re.sub(r'\([^)]*\)','',t).lower())
 if not words:return False,0
 checked=[w for w in words if len(w)>2]
 coverage=sum(known(w) or freq(w,'ru')>=1.5 for w in checked)/max(1,len(checked))
 if coverage<.75:return False,coverage
 if len(words)==1:
  poses={p.tag.POS for p in parses(words[0]) if p.score>=.05}
  if typ=='глагол' and 'INFN' not in poses:return False,coverage
  if typ=='существительное' and not poses.intersection({'NOUN','NPRO'}):return False,coverage
  if typ=='прилагательное' and not poses.intersection({'ADJF','ADJS','PRTF','PRTS','COMP'}):return False,coverage
 return True,coverage
pool=json.load(open(P/'pool.json'));out=[];reject=collections.Counter()
for key,xs in pool.items():
 choices=[]
 for x in xs:
  for ix,(raw,cats) in enumerate(x['senses']):
   t,tags=normalize(raw)
   if not t or len(t)>120:continue
   ok,cov=morphok(t,x['type'])
   if not ok:continue
   if re.search(r'жаргон|грубое|простореч|презр|пренебр|pejorative|slang', ' '.join(tags+cats+x['cats']),re.I):continue
   def units(z):return set(q.strip().lower() for q in re.split('[,;]',re.sub(r'\([^)]*\)','',z)) if len(q.strip())>2)
   agreement=any(y['source']!=x['source'] and y['type']==x['type'] and any(units(t)&units(normalize(ot)[0] or '') for ot,_ in y['senses']) for y in xs)
   rf=freq(re.sub(r'\([^)]*\)','',t),'ru')
   score=rf*.2+agreement*2.5+(x['source'].startswith('Русский'))*.5+(x['source'].startswith('FreeDict'))*1.1-ix*1.5
   choices.append((score,x,t,tags,cats,agreement))
 if not choices:reject['no acceptable translation']+=1;continue
 choices.sort(key=lambda z:z[0],reverse=True)
 score,x,t,tags,cats,agreement=choices[0]
 # Keep one coherent, useful meaning rather than a mixture of unrelated parts of speech.
 allcats=' '.join(cats+x['cats']+tags)
 theme=[name for name,pat in topics if re.search(pat,allcats,re.I)][:2]
 context=[z for z in tags if z not in {'книжное','переносное значение'}]
 # Domain context stays useful even with topic filtering.
 if context and '(' not in t:t+=' ('+', '.join(context[:2])+')'
 typ=x['type'];word=x['word']
 if typ=='глагол' and ' ' in word:typ='фразовый глагол' if len(word.split())<=3 else 'фраза'
 if typ in {'глагол','фразовый глагол'}:word='to '+word
 en=freq(key,'en')
 rank=en*2+min(score,5)*.6+agreement*1.5-(len(key.split())>4)*1.5
 out.append({'row':[word,t,typ,'Не определён','; '.join(theme)],'key':key,'source':x['source'],'rank':round(rank,3),'agreement':agreement,'categories':cats+x['cats']})
out.sort(key=lambda x:(-x['rank'],x['key']))
json.dump(out,open(P/'ranked.json','w'),ensure_ascii=False)
print('accepted',len(out),'rejected',reject)
for idx in [0,10000,20000,30000,36473,len(out)-1]:
 if idx<len(out):print('rank',idx,out[idx]['rank'],out[idx]['row'])
random.seed(45)
for x in random.sample(out[:36474],min(140,len(out))):print(x['rank'],'|',' | '.join(x['row'][:3]))
