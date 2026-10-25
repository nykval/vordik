import sys,json,re,collections,random,xml.etree.ElementTree as ET
from pathlib import Path
sys.path.insert(0,'/tmp/vordik-lexicon-libs')
from wordfreq import zipf_frequency as freq
P=Path(__file__).parent
ranked=json.load(open(P/'ranked.json'));pool=json.load(open(P/'pool.json'));old=json.load(open(P/'current.json'))
english={line.strip().split('/')[0].lower() for fn in ['en_US.dic','en_GB.dic'] for line in open(P/fn)}
def enok(x):return freq(x['key'],'en')>0
def key(w):return re.sub('^to ','',w.lower().strip()).replace('’',"'")
def plain(t):return re.sub(r'\([^)]*\)','',t).replace('\u0301','').strip().lower()
ns={'t':'http://www.tei-c.org/ns/1.0'};definitions=collections.defaultdict(list)
for x in ET.parse(P/'eng-rus.tei').findall('.//t:entry',ns):
 w=key(x.findtext('t:form/t:orth',namespaces=ns))
 for s in x.findall('t:sense',ns):
  defs=' '.join(d.text or '' for d in s.findall('.//t:def',ns))
  for t in s.findall('t:cit/t:quote',ns):definitions[(w,plain(t.text or ''))].append(defs)
fixes={
 'baby monitor':('радионяня','Технологии'), 'guilty pleasure':('удовольствие, которого стесняются','Характер человека'),
 'ligament':('связка (анатомия)','Тело и здоровье'), 'bromance':('тесная дружба между мужчинами','Отношения'),
 'death adder':('смертельная змея (вид ядовитых змей)','Животные'), 'in toto':('целиком, полностью',''),
 'triumvirate':('триумвират (союз трёх правителей)','Политика'), 'guilty as charged':('виновен по предъявленному обвинению','Право'),
 'sojourner':('временный житель','Путешествия'), 'habituation':('привыкание','Характер человека'), 'stile':('перелаз через ограду',''),
 'tone number':('номер тона','Язык и речь'), 'godet':('клин (в одежде)','Одежда'), 'fogey':('старомодный человек','Характер человека'),
 'black liquor':('чёрный щёлок','Химия'), 'billow':('большая волна','Природа'), "can't wait":('не терпится','Общение'),
 'water shortage':('нехватка воды','Природа'), 'votive':('обетный (посвящённый божеству по обету)','Религия и мифология'),
 'chow':('еда (разговорное)','Еда и напитки'), 'spar':('рангоутное дерево (мачта или перекладина)','Путешествия'),
 'twister':('смерч','Природа'), 'tortilla chip':('кукурузный чипс','Еда и напитки'), 'least common multiple':('наименьшее общее кратное','Математика'),
 'looking-glass':('зеркало',''), 'house of worship':('храм','Религия и мифология'), 'hydride':('гидрид (соединение водорода)','Химия'),
 'obscurantist':('мракобес','Характер человека'), 'mitten':('варежка','Одежда'), 'hemorrhoid':('геморроидальный узел','Тело и здоровье'),
 'what do you mean':('что ты имеешь в виду','Общение'), 'heterogeneity':('неоднородность',''),
 'cold chain':('холодовая цепь (хранение и перевозка при низкой температуре)','Путешествия'),
 'ranch dressing':('соус ранч','Еда и напитки'), 'first in first out':('первым пришёл — первым ушёл (принцип очереди)','Технологии'),
 'sodium nitrate':('нитрат натрия','Химия'), 'power function':('степенная функция','Математика'),
 'hot dog':('хот-дог (сосиска в булочке)','Еда и напитки'), 'genic':('генный','Биология'),
 'threshing sledge':('молотильная доска','Сельское хозяйство'), 'self-righteousness':('убеждённость в собственной правоте','Характер человека'),
 'butterscotch':('сливочная карамель','Еда и напитки'), 'misfit':('человек, который не вписывается в своё окружение','Отношения'),
 'quarantiner':('работник карантинной службы','Тело и здоровье'), 'protected':('защищённый',''),
 'shirk':('уклоняться (от обязанностей)','Действия человека'), 'abstinence':('воздержание','Тело и здоровье'),
 'doss-house':('ночлежка',''), 'philogyny':('любовь к женщинам','Отношения'),
 'pronate':('поворачивать внутрь (кисть или стопу)','Тело и здоровье'), 'way out':('выход',''),
 'snowcock':('улар (горная птица)','Животные'), 'archrival':('главный соперник','Отношения'),
 'hum idify':('увлажнять',''), 'zapper':('пульт дистанционного управления (разговорное)','Технологии'),
 'rooming house':('дом со сдаваемыми комнатами','Путешествия'), 'preputial':('относящийся к крайней плоти','Тело и здоровье'),
 'earldom':('графский титул','История и общество'), 'hotspot':('горячая точка',''),
 'rheum':('слизистые выделения','Тело и здоровье'), 'kettle of fish':('положение дел',''),
 'guilty':('виновный','Право'), 'royal assent':('королевское одобрение закона','Право'),
 'great-grandchild':('правнук, правнучка','Отношения'), 'inform on':('доносить на кого-либо','Общение'),
 'sleep with':('спать с кем-либо (о сексуальных отношениях)','Отношения'),
 'second-guess':('предугадывать; критиковать задним числом','Действия человека'),
 'spatula':('кухонная лопатка','Еда и напитки'), 'inbred':('рождённый от близкородственного скрещивания','Биология'),
 'facies':('фация (комплекс природных признаков)','Природа'), 'mesolithic':('мезолит (средний каменный век)','История и общество'),
 'snipe hunt':('бессмысленное поручение (розыгрыш)','Общение'),
 'stalactite':('сталактит (каменный нарост на потолке пещеры)','Природа'),
 'espouse':('поддерживать (идею или убеждение)','Действия человека'), 'unknowable':('непознаваемый','Философия'),
 'bulk carrier':('сухогруз для сыпучих грузов','Путешествия'), 'all rights reserved':('все права защищены','Право'),
 'such as':('например, такой как','Общение'), 'worship the porcelain god':('рвать (о рвоте; разговорное)','Тело и здоровье'),
 'hereupon':('сразу после этого',''), 'nevermind':('внимание (разговорное)',''),
 'starring role':('главная роль','Искусство и медиа'), 'centrally':('в центре',''),
 'buy-in':('согласие и поддержка','Работа'), 'greens':('зелень (съедобная)','Еда и напитки'),
 'birdlime':('птичий клей (для ловли птиц)','Животные'), 'werewolf':('оборотень','Религия и мифология'),
 'eyestalk':('глазной стебелёк (у животного)','Животные'), 'sext':('сообщение сексуального содержания','Общение'),
 'decode':('расшифровывать','Технологии'), 'wallah':('работник (в сочетаниях, обозначающих занятие)','Работа'),
 'lexis':('лексика','Язык и речь'), 'hygrophilous':('влаголюбивый','Биология'), 'paramecium':('инфузория-туфелька','Биология'),
 'go about':('приступать к делу','Действия человека'), 'rest-pause':('короткая пауза отдыха','Спорт и игры'),
 'woolly rhinoceros':('шерстистый носорог','Животные'), 'brock':('барсук','Животные'),
 'dungeon':('заключать в темницу','История и общество'), 'rotatory':('вращательный',''),
 'catgut':('кетгут (рассасывающийся хирургический шовный материал)','Тело и здоровье'),
 'chaperon':('сопровождающий (для присмотра)','Отношения'), 'come back':('возвращаться','Действия человека'),
 'toque':('шляпа без полей','Одежда'), 'brown sauce':('коричневый соус','Еда и напитки'),
 'wrist-slap':('мягкое наказание','Право'), 'cairn':('каменная насыпь (ориентир или памятный знак)','Путешествия'),
 'sylph':('сильф (дух воздуха)','Религия и мифология'), 'provident':('предусмотрительный','Характер человека'),
 'marrow':('костный мозг','Тело и здоровье'), 'promontory':('мыс','Природа'),
 'hard-won':('доставшийся с трудом',''), 'farriery':('ковка лошадей','Сельское хозяйство'),
 'demean':('унижать','Общение'), 'goad':('стрекало (палка для погоняния скота)','Сельское хозяйство'),
 'carry off':('уносить','Действия человека'), 'forefront':('передний план',''),
 'misdeed':('проступок, злодеяние','Право'), 'medicate':('лечить лекарствами','Тело и здоровье'),
 'hit the road':('отправляться в путь','Путешествия'), 'discus':('диск (спортивный снаряд)','Спорт и игры'),
 'rest on one\'s laurels':('почивать на лаврах','Характер человека'),
 'boat people':('беженцы, покидающие страну на лодках','История и общество'),
 'raconteur':('искусный рассказчик','Общение'), 'morning sickness':('тошнота при беременности','Тело и здоровье'),
 'debauchery':('разврат, разгул','Характер человека'), 'word salad':('бессвязная речь','Тело и здоровье'),
 'man is the measure of all things':('человек — мера всех вещей','Философия'),
 'social housing':('социальное жильё','История и общество'), 'quinquennium':('пятилетие',''),
 'red scarf':('красный шарф','Одежда'), 'fire lance':('огненное копьё (старинное оружие)','История и общество'),
 'nail clipper':('щипчики для ногтей','Внешность человека'), 'foment':('разжигать (недовольство или конфликт)','Общение'),
 'yuk it up':('громко смеяться и веселиться','Общение'), 'nausea':('тошнота','Тело и здоровье'),
 'track and field':('лёгкая атлетика','Спорт и игры'), 'lone wolf':('одиночка','Характер человека'),
 'standoff':('противостояние','Отношения'), 'recovery truck':('эвакуатор','Путешествия'),
 'ballista':('баллиста (метательная машина)','История и общество'),
 'proclamation':('официальное объявление','Политика'), 'tonic':('тонизирующий','Тело и здоровье'),
 'excitatory':('возбуждающий','Биология'), 'coaster':('подставка под стакан','Еда и напитки'),
 'sewer':('канализационная труба',''), 'pituitary':('гипофизарный','Тело и здоровье'),
 'streamer':('стример (ведущий интернет-трансляции)','Технологии'), 'stunt':('трюк','Искусство и медиа'),
 'foppish':('щегольской','Внешность человека'), 'buckram':('жёсткая переплётная ткань','Технологии'),
 'apposition':('приложение (в грамматике)','Язык и речь'), 'block-buster':('блокбастер','Искусство и медиа'),
 'half brother':('единокровный или единоутробный брат','Отношения'),
 'half sister':('единокровная или единоутробная сестра','Отношения'),
 'headliner':('главный участник концерта или фестиваля','Искусство и медиа'),
 'bull bar':('защитная дуга на бампере','Путешествия'), 'medicine bag':('сумка с лекарствами','Тело и здоровье'),
 'fandom':('сообщество поклонников','Искусство и медиа'), 'double take':('удивлённый повторный взгляд','Действия человека'),
 'value for money':('хорошее соотношение цены и качества','Покупки'), 'companionship':('дружеское общение','Отношения'),
 'high fidelity':('высокая точность воспроизведения звука','Технологии'), 'missed abortion':('замершая беременность','Тело и здоровье'),
 'club-law':('право сильного','Право'), 'coniferous':('хвойный','Природа'),
 'co-parent-in-law':('сват, сватья','Отношения'), 'multicolored':('разноцветный',''), 'nag':('кляча','Животные'),
 'separate the sheep from the goats':('отделять хорошее от плохого',''), 'sib':('брат или сестра','Отношения'),
 'make friends':('заводить друзей','Отношения'), 'heat-treat':('подвергать термической обработке','Технологии'),
 'eavesdropper':('человек, подслушивающий чужие разговоры','Общение'),
 'wardrobe malfunction':('неловкость из-за случайно сползшей или порвавшейся одежды','Одежда'),
 'lift a finger':('пошевелить пальцем (обычно в отрицании)','Действия человека'),
 'excuse me':('извините','Общение'), 'charmer':('обаятельный человек','Характер человека'),
 'matriarch':('женщина — глава семьи или рода','Отношения'), 'ladyship':('миледи (форма обращения)','Общение'),
 'sandbank':('песчаная отмель','Природа'), 'solemn':('торжественный, серьёзный','Характер человека'),
 'mulatto':('мулат','История и общество'), 'free software':('свободное программное обеспечение','Технологии'),
 'handy dandy':('удобный и полезный',''), 'carrier bag':('пакет для покупок','Покупки'),
 'gable':('щипец (верхняя часть стены под скатами крыши)',''), 'decking':('настил',''),
 'computer tampering':('несанкционированное вмешательство в работу компьютера','Технологии'),
 'maternal aunt':('тётя по матери','Отношения'), 'tracklist':('список композиций','Искусство и медиа'),
 'filibuster':('затягивание парламентских дебатов','Политика'), 'old woman':('пожилая женщина',''),
 'mental illness':('психическое заболевание','Тело и здоровье'), 'paper cut':('порез бумагой','Тело и здоровье'),
 'household name':('всем известное имя или название','Общение'),
 'root beer':('рутбир (сладкий газированный напиток)','Еда и напитки'),
 'cash cow':('источник стабильного дохода','Деньги'), 'red pepper':('красный перец','Еда и напитки'),
 'backhoe':('экскаватор с обратной лопатой','Технологии'), 'metalhead':('поклонник тяжёлого металла','Искусство и медиа'),
 'melting pot':('плавильный котёл (также о смешении культур)','История и общество'),
 'recorder':('записывающее устройство','Технологии'), 'nail polish':('лак для ногтей','Внешность человека'),
 'fig-leaf':('фиговый лист','Природа'), 'aboveground':('над землёй',''),
 'tightrope walker':('канатоходец','Искусство и медиа'), 'dog-end':('окурок (разговорное)',''),
 'meat-safe':('шкаф для хранения мяса','Еда и напитки'), 'on the move':('в движении','Путешествия'),
 'foramen':('отверстие (анатомия)','Тело и здоровье'),
 'scaremonger':('паникёр','Характер человека'), 'dressing':('заправка (для салата)','Еда и напитки'),
}
exclude={'og oing','ogoing','deraillleur','sabouraud','scape','zootie','woobie','iPhone','nookie','ruddle','fudge packer','sap-head'}
exclude={x.lower() for x in exclude}
out=[]
canonical=lambda w:re.sub(r"[\s'’\-]",'',key(w))
seen={canonical(r[0]) for r in old[1:]}
for x in ranked:
 if not enok(x) or x['key'] in exclude:continue
 if canonical(x['key']) in seen:continue
 if x['source'].startswith('Мюллер') and '-' in x['key'] and len({y['source'] for y in pool[x['key']]})==1 and freq(x['key'].replace('-',''),'en')==0:continue
 row=x['row'];w,t,typ,level,theme=row
 if re.search(r'^(сленг|разг\b|жарг\b|сокр\b|мн\b|устар\b|редк\b|диал\b)|\bфамилия\b',t,re.I):continue
 if re.search(r'[A-Z]',w) and typ!='сокращение':continue
 if x['key'] in fixes:
  t,theme=fixes[x['key']];row[1]=t;row[4]=theme;x['editorial_correction']=True
 # Uniform classification of multiword units; verb + particle retains its own type.
 if ' ' in x['key'] and typ!='сокращение':
  if typ in {'глагол','фразовый глагол'} and re.search(r'\b(?:up|down|out|in|off|on|over|away|back|around|round|through|about|across|along|forward|ahead|after|for|with|into|from|of|to|by|at)$',x['key']) and not re.match(r"(?:can|can't|cannot|could|will|would|should|must)\b",x['key']):
   row[2]='фразовый глагол';row[0]='to '+x['key']
  else:
   row[2]='фраза';row[0]=x['key']
 if x['key']=='pronate':row[0]='to pronate';row[2]='глагол'
 if x['key']=='inbred':row[2]='прилагательное'
 if x['key']=='dressing':row[0]='dressing';row[2]='существительное'
 if x['key']=='raconteur':row[0]='raconteur';row[2]='существительное'
 if x['key']=='rest-pause':row[0]='rest-pause';row[2]='существительное'
 if x['key']=='rotatory':row[0]='rotatory';row[2]='прилагательное'
 if x['key'] in {'streamer','stunt','buckram','apposition','sewer','block-buster'}:row[0]=x['key'];row[2]='существительное'
 if x['key']=='pituitary':row[0]='pituitary';row[2]='прилагательное'
 if x['key']=='mulatto':row[0]='mulatto';row[2]='существительное'
 if re.fullmatch(r'(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth|fortieth|fiftieth|sixtieth|seventieth|eightieth|ninetieth|hundredth|thousandth)(?:[ -](?:one|two|three|four|five|six|seven|eight|nine|hundred|thousand|million|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|hundredth|thousandth))*',x['key']):row[2]='числительное'
 # Add only domains explicitly supported by the matching definition.
 d=' '.join(definitions.get((x['key'],plain(row[1])),[]))
 domain=[]
 patterns=[('Животные',r'^.*?\b(?:A|An|Any|The) (?:species of |genus of |small |large |marine |tropical |freshwater |wild |domesticated )*(?:bird|fish|mammal|reptile|insect|butterfly|moth|beetle|antelope|whale|snake|lizard|rodent|crab|spider|animal|monkey|deer)\b'),('Природа',r'\b(?:A|An|Any|The) (?:species of |genus of |small |large |flowering |deciduous |evergreen |tropical |herbaceous |perennial )*(?:plant|tree|shrub|herb|flower|fungus|mushroom)\b'),('Еда и напитки',r'\b(?:A|An|The) (?:type of |kind of |dish of |alcoholic |sweet |traditional |carbonated )*(?:dish|food|soup|sauce|drink|beverage|dessert|cake|bread|cheese|pastry)\b'),('Одежда',r'\b(?:A|An) (?:type of |kind of |piece of |sleeveless |long |short )*(?:garment|hat|shirt|coat|dress|shoe|boot|jacket)\b'),('Тело и здоровье',r'\b(?:A|An) (?:type of |kind of |chronic |acute |medical |infectious |inflammatory )*(?:disease|disorder|syndrome|symptom|illness|infection|inflammation|surgical procedure)\b')]
 for name,pat in patterns:
  if re.search(pat,d):domain.append(name)
 if domain and not row[4]:row[4]='; '.join(domain[:2])
 out.append(x)
 seen.add(canonical(x['key']))
target=50000-len({r[0].lower() for r in old[1:]})
print('eligible',len(out),'needed',target)
assert len(out)>=target,(len(out),target)
out=out[:target]
out.sort(key=lambda x:x['key'])
combined=old+[x['row'] for x in out]
assert len({r[0].lower() for r in combined[1:]})==50000
assert len(set(tuple(r+['']*(5-len(r))) for r in combined[1:]))==len(combined)-1
assert not ({key(r[0]) for r in old[1:]} & {x['key'] for x in out})
assert len({x['key'] for x in out})==len(out)
json.dump(out,open(P/'selected.json','w'),ensure_ascii=False)
json.dump([x['row'] for x in out],open(P/'new-rows.json','w'),ensure_ascii=False)
json.dump(combined,open(P/'expanded.json','w'),ensure_ascii=False)
print('counts',len(combined)-1,'unique',len({r[0].lower() for r in combined[1:]}))
print('topics',collections.Counter(t for x in out for t in x['row'][4].split('; ') if t))
random.seed(112)
with open(P/'review.tsv','w') as f:
 for x in random.sample(out,400):f.write('\t'.join(x['row'][:3])+'\n')
