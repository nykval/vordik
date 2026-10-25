import json,re,collections,sys,functools,random
from pathlib import Path
sys.path.insert(0,'/tmp/vordik-lexicon-libs')
from wordfreq import zipf_frequency
import pymorphy3
P=Path(__file__).parent
old=json.load(open(P/'live-pairs-before.json'))
notes=json.load(open(P/'source-notes-before.json'))
oxford=json.load(open(P/'oxford-map.json'))
levels=['A1','A2','B1','B2','C1','C2']
morph=pymorphy3.MorphAnalyzer()
@functools.lru_cache(None)
def parse(w):return morph.parse(w.lower())[0]
@functools.lru_cache(None)
def poses(w):return {p.tag.POS for p in morph.parse(w.lower())}
@functools.lru_cache(None)
def freq(w,lang='en'):return zipf_frequency(w,lang)
def key(w):return re.sub(r'^to ','',w.strip().lower()).replace('’',"'")
def plain(t):return re.sub(r'\([^)]*\)','',t).strip().lower().replace('ё','е')
def words(t):return re.findall(r'[а-яё-]+',plain(t))
def normalize(t):
 t=re.sub(r'\s+',' ',t).strip().rstrip(';,. ')
 t=t.replace('и тому подобное','и т. п.').replace('(также )','')
 for a,b in [('потому, что','потому что'),('так же, как','так же как'),('так, будто','так будто'),('с тех пор, как','с тех пор как'),('после того, как','после того как'),('до того, как','до того как'),('в то время, как','в то время как'),('ввиду того, что','ввиду того что'),('в тот момент, когда','в тот момент когда')]:t=t.replace(a,b)
 return t.strip()

# Exact editorial corrections for malformed definitions and shared-head alternatives.
fix={
 'safety glass':['небьющееся стекло','безосколочное стекло'],
 'hardiness':['выносливость','стойкость'],
 'pulmonary tuberculosis':['туберкулёз лёгких'],
 'collider':['коллайдер'],
 'brown ale':['коричневый эль'],
 'ghostwriter':['автор, пишущий под чужим именем'],
 'out of the loop':['не в курсе событий'],
 'thread count':['плотность ткани (число нитей на единицу длины)'],
 'where the rubber meets the road':['момент перехода от слов к делу'],
 'because':['потому что'],
 'non-metal':['неметалл'],
 'field of vision':['поле зрения'],
 'salaried':['получающий зарплату'],
 'scoreless':['без набранных очков'],
 'nationally':['в масштабе страны'],
 'piece of cake':['проще простого'],
 'walk in the park':['лёгкое дело'],
 'cyberaddict':['человек с интернет-зависимостью'],
 'man and boy':['с детства'],
 'let bygones be bygones':['кто старое помянет, тому глаз вон'],
 "one man's meat is another man's poison":['что одному хорошо, то другому плохо'],
 "make one's bed and lie in it":['что посеешь, то и пожнёшь'],
 'reap what one sows':['пожинать плоды своих поступков'],
 "what's lost is lost":['что потеряно, того не вернёшь'],
 'what you see is what you get':['что видишь, то и получаешь'],
 'to narrow down sth':['сузить выбор'],
 'to keep away (sb/sth)':['держаться подальше','не подпускать'],
 'to fit in sb/sth':['найти время для встречи с кем-либо','найти время для дела'],
 'to cut out sth':['вырезать что-либо'],
 'to draw on sth':['использовать что-либо'],
 'to give up sth/doing sth':['бросить что-либо','перестать заниматься чем-либо'],
 'to follow up sth':['продолжить работу над чем-либо'],
 'to stay in':['оставаться дома'],
 'to pull up':['остановиться (о машине)'],
 'to work on sth':['работать над чем-либо'],
 'to bring sb around':['уговорить кого-либо'],
 'to talk sb around':['уговорить кого-либо'],
 'to go together':['сочетаться'],
 'to be up to sth':['замышлять что-либо','заниматься чем-либо'],
 'to be caught up in sth':['оказаться вовлечённым во что-либо'],
 'to fizzle out':['постепенно сойти на нет'],
 'to stay ahead':['оставаться впереди'],
 'to step up sth':['усилить что-либо'],
 'to sink in':['осознаваться постепенно'],
 'to ring in':['позвонить на работу'],
 'to send up sb/sth':['пародировать кого-либо или что-либо'],
 'to squeeze in sth/sb':['выкроить время для кого-либо или чего-либо'],
 'to run off with sb':['сбежать с кем-либо'],
 'to run sth by sb':['посоветоваться с кем-либо'],
 'to suss out sb/sth':['разобраться в ком-либо или чём-либо'],
 'to rope in sb':['привлечь кого-либо к делу'],
 'to set out sth':['изложить что-либо'],
 'to swot up (sth)':['усиленно учить что-либо'],
 'to take aside sb':['отвести кого-либо в сторону'],
 'to read over sth':['перечитать что-либо'],
 'to read through':['прочитать целиком'],
 'to keep up (sth)':['продолжать что-либо'],
 'to oversleep':['проспать'],
 'to get mixed up in sth':['ввязаться во что-либо'],
 'to get around to sth/doing sth':['наконец заняться чем-либо'],
 'to let on':['выдать секрет'],
 'to figure out sth':['разобраться в чём-либо','найти ответ'],
 'to whom it may concern':['всем заинтересованным лицам'],
 'to calm down (sb)':['успокоиться','успокоить кого-либо'],
 'to clog up (sth)':['засориться','засорить что-либо'],
 'to take sb through sth':['пошагово объяснить что-либо кому-либо','показать, как это делается'],
 'to hit back':['дать отпор','ответить критикой'],
 'to outlast':['продлиться дольше чего-либо','превосходить по длительности'],
 'to welsh':['сбежать, не уплатив долг'],
 'to sweep up (sth)':['подмести'],
 'to bottle up sth':['подавлять чувства'],
 'to put up with sth/sb':['терпеть кого-либо или что-либо'],
 'to wipe off':['стереть (с поверхности)'],
 'to clean off':['очистить поверхность'],
 'to pay up':['расплатиться'],
 'to tidy up (sth)':['прибраться'],
 'to check out':['выписаться из отеля'],
 'to stay away from sth':['держаться подальше от чего-либо'],
 'to get out of sth/doing sth':['уклониться от чего-либо'],
 'to let down sb':['подвести кого-либо'],
 'to take sb through sth':['объяснить что-либо кому-либо','показать, как это делается'],
 'preemptively':['заранее','упреждающе'],
 'apparently':['по-видимому','судя по всему'],
 'food':['еда','пища'],
 'abnormal behavior':['аномальное поведение','отклоняющееся поведение (психология)'],
 'easy on the eye':['приятный глазу','привлекательный','симпатичный'],
 'seat of government':['местонахождение правительства','местопребывание правительства'],
 'sound change':['звуковое изменение','фонетическое изменение (лингвистика)'],
 'general practice':['общая практика','работа врача общей практики','работа юриста широкого профиля'],
 'schematic drawing':['схематическое изображение','схематический чертёж'],
 'property right':['имущественное право','право на имущество','право собственности (право)'],
 'dial-up access':['доступ по коммутируемой телефонной линии','доступ по телефонной линии'],
 'compression chamber':['камера сжатия','камера сгорания','компрессионная барокамера (техника)'],
 'abnormal personality':['расстройство личности','психопатия (психология)'],
 'scintillation counter':['сцинтиллятор','сцинтилляционный счётчик','счётчик вспышек'],
 'mad-dog weed':['частуха обыкновенная','частуха подорожниковая','водный подорожник (ботаника)'],
 'queen consort':['королева-супруга','королева-консорт'],
 'carrying trade':['перевозка товаров водным путём','фрахтовое дело'],
 'sausage fest':['мероприятие, на котором почти одни мужчины'],
 'bone china':['тонкий костяной фарфор'],
 'in the long run':['в долгосрочной перспективе','в конечном счёте','в конце концов'],
 'decree nisi':['условное постановление о разводе'],
 'hollow ware':['глубокая посуда'],
 'bling bling':['броские украшения'],
 'the last minute':['последний момент'],
 'wherever':['где угодно'],
 'specifically':['конкретно','особенно'],
 'commonly':['обычно','повсеместно'],
 'typically':['обычно','типично'],
 'regularly':['регулярно','часто'],
 'exceptionally':['исключительно','особенно'],
 'notwithstanding':['вопреки','несмотря на'],
 'sometime':['когда-нибудь','когда-то'],
 'as well as':['а также','так же как'],
 'as a rule':['как правило','обычно'],
 'by no means':['вовсе не','ни в коем случае'],
 'ordinarily':['обычно','при обычных обстоятельствах'],
 'every now and then':['время от времени'],
 'somebody':['кто-то','кто-нибудь'],
 'anybody':['кто-нибудь','кто угодно'],
 'anyone':['кто-нибудь','кто угодно'],
 'whoever':['кто бы ни','любой, кто'],
 'whosoever':['кто бы ни','любой, кто'],
 'whereabouts':['где','местонахождение'],
 'since':['с тех пор как','поскольку','так как'],
 'provided (that)':['при условии что','если только'],
 'though':['хотя','несмотря на то что'],
 'as':['как','поскольку'],
 'that':['что','чтобы'],
 'so':['поэтому','так что'],
 'yet':['однако','тем не менее'],
 'cuz':['потому что (разговорное)'],
 'for a change':['для разнообразия'],
 "to let's":['давайте'],
 'to open onto sth':['выходить куда-либо (о двери или окне)'],
 'to blow up (sth)':['взорвать','взорваться'],
 'to dress (sb) up':['нарядиться','нарядить кого-либо'],
 'to warm up (sth/sb)':['нагреваться','нагревать'],
 'to miss out sb/sth':['пропустить кого-либо','пропустить что-либо'],
 'to cool down (sb/sth)':['остывать','охлаждать'],
 'to be left over':['оставаться неиспользованным'],
 'to dying for sth':['очень сильно хотеть чего-либо'],
 'to blow down (sth)':['снести ветром'],
 'to come out':['выходить'],
}
# Only apply sense-dependent fixes to the matching original text.
fix.pop('to come out')
clause=re.compile(r'^(?:котор\w*|кто\b|что\b(?![- ])|что (?!(?:угодно|надо)\b)|чтобы\b|чь\w*|чем\b|где\b(?![-?])|когда\b|хотя\b|несмотря\b|особенно\b|обычно\b|часто\b|как правило\b|так что\b|при которой\b|поскольку\b|если\b|но\b|а также\b|не (?:имея|позволяя|принимая|оправдав|уплатив|теряя|задумываясь)\b)')
participle=re.compile(r'^(?:используем|предназначенн|состоящ|получаем|находящ|являющ|имеющ|осуществляющ|приведш|опубликованн|равнодушн|накапливающ|покидающ|подслушивающ|нарушающ|выполняющ|рожденн|рождённ|питающ|равн\w* на|украшающ|сделанн|выражающ)')
preserve_clause_heads={'человек','лицо','тот','то','всё','все','вещь','предмет','вещество','устройство','система','функция','издание','часть','участок','разновидность','здание','предприятие','страна','магазин','женщина','судно','книга','статья','клин','блюдо','бар','копия','плита','поведение','стечение','удовольствие','скот'}
def top_parts(t):
 out=[];buf='';depth=0;quote=None;i=0
 while i<len(t):
  c=t[i]
  if c in '«"' and not quote:quote='»' if c=='«' else '"'
  elif c==quote:quote=None
  if c=='(':depth+=1
  if c==')':depth=max(0,depth-1)
  delimiter=0
  if depth==0 and not quote:
   if c in ',;':delimiter=1
   elif t[i:i+5]==' или ':delimiter=5
  if delimiter:
   out.append((buf.strip(),t[i:i+delimiter]));buf='';i+=delimiter;continue
  buf+=c;i+=1
 out.append((buf.strip(),''));return out

split_log=[];ambiguous=[]
typedfix={
 ('as','союз'):['когда','поскольку'],
 ('as','наречие'):['так же как'],
 ('as','предлог'):['как','в качестве'],
 ('that','союз'):['что','чтобы'],
 ('so','союз'):['поэтому','так что'],
 ('since','предлог'):['с','после'],
 ('since','наречие'):['с тех пор'],
 ('since','союз'):['с тех пор как','поскольку'],
 ('whereabouts','наречие'):['где','где именно'],
 ('whereabouts','существительное'):['местонахождение'],
}
def split_translation(w,t,typ):
 if (w,typ) in typedfix:return typedfix[w,typ]
 if w in fix:return fix[w]
 if key(w) in fix:return fix[key(w)]
 t=normalize(t)
 # A long dictionary definition may contain commas inside one Russian explanation.
 rawparts=top_parts(t)
 if typ in {'фразовый глагол','фраза'} and len(t)>43 and len(rawparts)>1:
  def independent_verbal(p):
   ww=words(p)
   return bool(ww and ('INFN' in poses(ww[0]) or (ww[0]=='не' and len(ww)>1 and 'INFN' in poses(ww[1]))))
  if not all(independent_verbal(p) and len(p)<40 for p,sep in rawparts):return [t]
 # Grammatical / comparative comma expressions are a single translation.
 t=t.replace('не кто иной, как','не кто иной как').replace('не что иное, как','не что иное как')
 parts=top_parts(t);out=[];protect=False
 for i,(p,sep) in enumerate(parts):
  if not p:continue
  prev=out[-1] if out else ''
  pw=words(prev);curw=words(p)
  lastsep=parts[i-1][1] if i else ''
  relative=bool(i and (clause.match(p) or re.match(r'^(?:в|на|с|у|по|при|о|к|от|из) котор',p) or (p.startswith('как ') and len(pw)>0 and (typ=='фраза' or pw[-1] in {'белый','легкий','черный'}))))
  dependent=bool(i and participle.match(p) and pw and (pw[0] in preserve_clause_heads or len(pw)>3))
  if i and typ=='фраза' and (re.match(r'^(?:то |так |тому |того |а |ни |не суйся)',p) or (prev.startswith('ни ') and p.startswith('ни '))):dependent=True
  if i and curw and parse(curw[0]).tag.POS=='GRND':dependent=True
  independent=False
  if curw:
   if typ=='существительное':independent=any(q.tag.POS=='NOUN' and 'nomn' in q.tag for q in morph.parse(curw[0])) and not protect
   elif typ in {'глагол','фразовый глагол'}:independent=any('INFN' in poses(x) for x in curw)
   elif typ=='наречие':independent='ADVB' in poses(curw[0])
   elif typ=='прилагательное':independent=bool(poses(curw[0])&{'ADJF','ADJS','PRTF','PRTS'})
  # 'человек, который ...' continues until a grammatically complete alternative starts.
  if protect and independent and not(relative or dependent):protect=False
  # An object list shares its verb: 'убрать человека или вещь'.
  if i and lastsep==' или ' and not relative and not dependent and not protect:
   verbidx=next((j for j,x in enumerate(pw) if 'INFN' in poses(x)),None)
   if verbidx is not None and not any('INFN' in poses(x) for x in curw):
    out[-1]+=' или '+p;protect=True;continue
  # A fragment such as 'на родину' keeps the governing word.
  if i and typ in {'глагол','фразовый глагол','существительное'} and re.match(r'^(?:в |на |с |к |от |из |для |по |при |без |под |над )',p):
   if typ in {'глагол','фразовый глагол'} and not any('INFN' in poses(x) for x in curw):dependent=True
   if typ=='существительное' and not any(q.tag.POS=='NOUN' and 'nomn' in q.tag for x in curw for q in morph.parse(x)):dependent=True
  # Do not split alternatives inside the same dependent definition.
  if i and (relative or dependent or protect):
   out[-1]+= (', ' if lastsep in {',',';'} else ' или ')+p
   protect=relative or dependent or protect
  else:out.append(p)
 # Shared noun: 'небьющееся, безосколочное стекло' -> two complete translations.
 if len(out)>1:
  tail=words(out[-1]);head=[x for x in tail if parse(x).tag.POS=='NOUN']
  if head and len(tail)<=5:
   for j,p in enumerate(out[:-1]):
    pwords=words(p)
    if pwords and all(parse(x).tag.POS in {'ADJF','ADJS','PRTF','PRTS'} or x=='не' for x in pwords) and typ in {'существительное','фраза'}:
     noun=next((x for x in tail if parse(x).tag.POS=='NOUN'),None)
     if noun:out[j]=p+' '+noun
 # A verb synonym in parentheses is an alternative, not a context label.
 result=[]
 for p in out:
  m=re.fullmatch(r'(.+?)\s*\(([а-яё-]+)\)',p)
  if m and typ in {'глагол','фразовый глагол'} and parse(m[2]).tag.POS=='INFN':
   result.extend([m[1],m[2]])
  else:result.append(p)
 result=list(dict.fromkeys(normalize(p) for p in result if normalize(p)))
 if len(result)>1:split_log.append([w,t,result])
 if any(',' in p or ' или ' in p for p in result):ambiguous.append([w,t,result])
 return result

aliases={'airplane':'aeroplane','airplanes':'aeroplane','favorite':'favourite','favorites':'favourite','gray':'grey','color':'colour','center':'centre','meter':'metre','liter':'litre','traveling':'travelling','traveled':'travelled','traveler':'traveller','theater':'theatre','behavior':'behaviour','neighbor':'neighbour','jewelry':'jewellery','license':'licence','check':'cheque'}
def ox(w,typ):
 if w+'|'+typ in oxford:return levels.index(oxford[w+'|'+typ])
 variants=[aliases.get(w,''),w.replace('ization','isation'),w.replace('ize','ise'),w.replace('yse','yze')]
 for a in variants:
  if a+'|'+typ in oxford:return levels.index(oxford[a+'|'+typ])
 return None
oxword=collections.defaultdict(list)
for k,v in oxford.items():oxword[k.split('|')[0]].append(levels.index(v))

# Meaning-specific levels are chosen independently of the other Russian equivalents.
sense_levels={}
def senses(w,entries):
 for lev,translations in entries.items():
  for tr in translations.split('|'):sense_levels[(w,plain(tr))]=levels.index(lev)
senses('work',{'A1':'работа|труд','B1':'произведение'})
senses('light',{'A1':'свет','A2':'легкий|светлый','B1':'несерьезный|небольшой','B2':'поверхностный'})
senses('run',{'A1':'бежать|бегать','A2':'управлять','B1':'работать|проходить','B2':'курсировать|течь|простираться'})
senses('bank',{'A1':'банк','B1':'берег','C1':'крен'})
senses('charge',{'B1':'плата|взимать плату|заряжать','B2':'обвинение|обвинять|заряд','C1':'нападение|поручение'})
senses('fine',{'A1':'хороший|прекрасный|хорошо','B1':'штраф|штрафовать|тонкий','B2':'мелкий|изысканный|точный'})
senses('issue',{'B1':'вопрос|проблема','B2':'выпуск|издание|выдавать','C1':'эмиссия'})
senses('interest',{'A1':'интерес','B1':'процент|проценты','B2':'доля|выгода'})
senses('mean',{'A1':'значить|означать|иметь в виду','B1':'злой|подлый','B2':'скупой|средний','C1':'среднее значение'})
senses('sentence',{'A1':'предложение','B2':'приговор|приговорить|приговор'})
senses('spring',{'A1':'весна','B2':'пружина|родник|прыжок'})
senses('plant',{'A1':'растение','B1':'завод|сажать','C1':'подброшенная улика'})
senses('match',{'A1':'матч','A2':'спичка','B1':'соответствие|соответствовать','B2':'пара|соперник'})
senses('case',{'A2':'случай','B1':'дело|чехол|футляр','B2':'падеж|корпус|довод'})
senses('fair',{'A2':'справедливый','B1':'ярмарка|светлый','B2':'достаточный|порядочный'})
senses('party',{'A1':'вечеринка','B1':'партия','B2':'сторона|группа'})
senses('right',{'A1':'правый|правильный|правильно|направо','B1':'право'})
senses('left',{'A1':'левый|налево','B2':'левые'})
senses('capital',{'A1':'столица','A2':'заглавная буква','B2':'капитал|капитальный'})
senses('still',{'A1':'всё ещё|все еще|еще','B1':'неподвижный|тихий','B2':'тем не менее','C1':'перегонный куб'})
senses('sound',{'A1':'звук','B2':'здравый|надежный|здоровый|прочный'})
senses('cool',{'A1':'прохладный','A2':'крутой','B1':'спокойный','B2':'равнодушный'})
senses('hot',{'A1':'горячий|жаркий','A2':'острый','B2':'популярный|напряженный'})
senses('hard',{'A1':'трудный|сложный|тяжело','A2':'твердый|усердно','B2':'жесткий|суровый'})
senses('board',{'A2':'доска','B1':'совет|садиться','B2':'правление|питание'})
senses('cell',{'A2':'камера','B1':'клетка','B2':'ячейка','C1':'элемент'})
senses('date',{'A1':'дата','A2':'свидание','B2':'финик'})
senses('draw',{'A1':'рисовать','B1':'ничья|тащить|вытягивать','B2':'жеребьевка|привлекать|делать вывод'})
senses('file',{'A2':'файл|папка','B2':'досье|подшивать|подавать','C1':'напильник'})
senses('figure',{'A2':'фигура','B1':'цифра','B2':'рисунок|деятель','C1':'полагать'})
senses('flat',{'A1':'квартира','A2':'плоский|ровный','B2':'спущенный|унылый','C1':'бемоль'})
senses('letter',{'A1':'письмо|буква','C1':'арендодатель'})
senses('nail',{'A2':'ноготь','B1':'гвоздь','B2':'прибивать'})
senses('note',{'A1':'записка','A2':'заметка|нота','B1':'банкнота|примечание|отмечать'})
senses('order',{'A2':'заказ|заказывать','B1':'порядок|приказ|приказывать','B2':'орден','C1':'отряд'})
senses('patient',{'A2':'пациент|терпеливый'})
senses('present',{'A1':'подарок','A2':'настоящий|присутствующий','B1':'представлять','B2':'преподносить'})
senses('record',{'A2':'запись|записывать','B1':'рекорд|пластинка','B2':'протокол'})
senses('rest',{'A1':'отдых|отдыхать','A2':'остаток|остальное','B2':'опора|покой'})
senses('rock',{'A2':'скала|камень|рок','B2':'качаться|качать'})
senses('row',{'A2':'ряд','B2':'ссора|грести'})
senses('scale',{'B1':'масштаб|шкала|весы','B2':'гамма|чешуя','C1':'накипь'})
senses('seal',{'B1':'тюлень','B2':'печать|печатать','C1':'уплотнение'})
senses('season',{'A1':'сезон|время года','B2':'приправлять'})
senses('sink',{'A2':'раковина','B1':'тонуть|погружаться','B2':'опускаться'})
senses('stick',{'A2':'палка','B1':'приклеивать|застревать','B2':'придерживаться'})
senses('subject',{'A1':'предмет','A2':'тема','B1':'подлежащее','B2':'подданный','C1':'подвергать'})
senses('table',{'A1':'стол','A2':'таблица','C1':'вносить на обсуждение'})
senses('train',{'A1':'поезд','A2':'тренироваться|обучать','C1':'шлейф|вереница'})
senses('wave',{'A2':'волна|махать','B1':'взмах','B2':'волна (физика)'})
senses('well',{'A1':'хорошо','A2':'здоровый','B1':'колодец','C1':'скважина'})
senses('will',{'A1':'будет','B1':'воля','B2':'завещание'})
senses('yard',{'A2':'двор','B1':'ярд'})
senses('book',{'A1':'книга','A2':'бронировать','B2':'заказывать'})
senses('pen',{'A1':'ручка','B2':'загон'})
senses('head',{'A1':'голова','B1':'руководитель|глава','B2':'направляться|возглавлять'})
senses('arm',{'A1':'рука','B1':'подлокотник','B2':'вооружать'})
senses('foot',{'A1':'нога|ступня','B1':'фут|подножие'})
senses('leg',{'A1':'нога','A2':'ножка','B2':'этап'})
senses('face',{'A1':'лицо','B1':'сталкиваться','B2':'грань|циферблат'})
senses('mouse',{'A1':'мышь'})
senses('key',{'A1':'ключ','B1':'клавиша|ключевой','B2':'тональность'})
senses('ocean',{'A2':'океан','C1':'масса'})
senses('drama',{'A2':'драма','B2':'драматургия'})
senses('conviction',{'B2':'убеждение','C1':'признание виновным'})
senses('filling',{'B1':'начинка','B2':'сытный|пломба (в зубе)'})
senses('might',{'A2':'мог бы','C1':'мощь|сила'})

manual={}
def manual_group(level,s):
 for w in s.split('|'):manual[w]=levels.index(level)
manual_group('A1','airplane|aeroplane|good morning|good night|thank you|excuse me|how are you|see you tomorrow|happy birthday|nice to meet you|my name is|ice cream|go to work|make friends|red scarf|old woman')
manual_group('A2','bottle opener|bedtime|hot dog|day off|seat belt|can opener|carrier bag|red pepper|what do you mean|looking-glass|way out|ice cube|post code|post-code|postcard|hairbrush|toothbrush|toothpaste|shopping bag|traffic lights|bus stop|train station|half past|quarter past|half brother|half sister')
manual_group('B1','softly|rudely|snore|snoring|kerb|curb|giggle|dim|hollow|dread|rot|come to an end|nail polish|mitten|spatula|coaster|baby monitor|great-grandchild|stepbrother|stepsister|stepparent|grandparent|corkscrew|rolling pin|washing-up liquid|chopping board|frying pan|nail clipper|paddling pool|go about|come back|hit the road|on the move|mental illness|paper cut|water shortage|colourful|multicolored|multicoloured|straightaway')
manual_group('B2','bouillon|plasticine|gravitation|stunt double|safe house|tooth fairy|absolute zero|zoology|zoologist|veterinary|vigilance|shaggy|gossipy|adware|back office|cash cow|household name|guilty pleasure|collider|bunting|aphid|drainage|normal distribution|possessive adjective|selfie stick|body shop|ligament|suspension|beam|beam up|out of the loop|thread count|half-life|stalactite|coniferous|sandbank|marrow|geek|ghostwriter')
manual_group('C1','white hole|baffle|alarmist|drainage basin|meandering|headword|saber saw|alpha helix|lysozyme|lysosome|tamarisk|screw coupling|algebraic number|square-law|northern wheatear|pulmonary tuberculosis|power function|guilty as charged|royal assent|filibuster|promontory|catgut|lexis|foramen|foment|esoteric|scaremonger|where the rubber meets the road')
manual_group('C2','ab initio|potlatch|broch|quinquennium|hygrophilous|philogyny|threshing sledge|sylph|obscurantist|plumose|variorum|thenceforth|thereupon|wherewith|whosoever')

advanced_domain=re.compile(r'анатом|биохим|генетик|цитолог|гистолог|квант|тополог|алгебр|математ|астроном|геолог|ботаник|зоолог|химия|физика|юридич|палеонт|энтoмолог|фармак|морфолог|фонолог',re.I)
advanced_term=re.compile(r'\b(?:quantum|tensor|eigen\w*|isotope|isomer|nucleotide|ribosomal|mitochondri\w*|lysosom\w*|chromosomal|thermodynamic\w*|hydrolysis|catalytic|lattice|quark|neutrino|fermion|boson|topological|homomorphism|isomorphism|cytoplasm|endoplasm\w*|phoneme|allomorph|morpheme|supremum|infimum|stoichiometr\w*|acetyl\w*|carbox\w*)\b')
everyday_nouns={'кухня','ложка','вилка','нож','тарелка','чашка','стакан','чайник','кастрюля','сковорода','щётка','щетка','полотенце','одеяло','подушка','простыня','наволочка','кровать','стул','стол','пакет','кнопка','дверь','окно','носок','шарф','перчатка','варежка','ботинок','туфля','шапка','рубашка','брюки','яблоко','молоко','яйцо','картофель','лук','морковь','огурец','суп','салат','соус','шоколад','конфета','печенье','кофе','чай','пиво','хлеб','сыр','масло','соль','сахар','лимон','сок'}
concrete_context={'Еда и напитки','Одежда','Покупки','Путешествия','Внешность человека','Отношения'}
stop_en={'a','an','the','of','to','on','in','at','by','for','and','or','with','without',"one's",'one','sb','sth','somebody','something','someone','yourself','oneself'}
def assess(w,t,typ,oldlevel,theme):
 k=key(w);p=plain(t)
 if (k,p) in sense_levels:return levels[sense_levels[k,p]],'meaning'
 if k in manual:return levels[manual[k]],'editorial'
 direct=ox(k,typ)
 special=bool(advanced_domain.search(t) or advanced_term.search(k))
 context=re.search(r'\(([^)]*)\)',t)
 # Oxford is a headword/POS guide. Technical, figurative and register-marked senses can be higher.
 if direct is not None:
  sc=direct
  if special:sc=max(sc,4)
  if context and re.search(r'перенос|юрид|редк|поэт|устар',context[1]):sc=max(sc,3)
  return levels[sc],'oxford'
 # Previously assigned levels of sourced phrase senses are useful where the exact expression is absent from Oxford.
 oldm=re.match('[ABC][12]',oldlevel)
 if oldm and typ in {'фразовый глагол','модальный глагол'}:
  return levels[max(levels.index(oldm[0]),4 if special else 0)],'existing-sense'
 # Transparent derivation, using verified base words rather than rarity of the derived spelling alone.
 deriv=[]
 if typ=='наречие' and k.endswith('ly'):
  bases=[k[:-2],k[:-3]+'y' if k.endswith('ily') else '',k[:-1]+'e' if k.endswith('bly') else '']
  deriv=[v for b in bases if (v:=ox(b,'прилагательное')) is not None]
 if typ=='существительное' and k.endswith('ness'):
  deriv=[v for b in [k[:-4],k[:-5]+'y' if k.endswith('iness') else ''] if (v:=ox(b,'прилагательное')) is not None]
 if typ=='прилагательное':
  for prefix in ['un','non-']:
   if k.startswith(prefix):
    v=ox(k[len(prefix):],'прилагательное')
    if v is not None:deriv.append(v)
 if deriv and not special:return levels[min(5,max(2,min(deriv)+1))],'derivative'
 if typ=='числительное':
  if k in {'eleventy','umpteen','zillion','gazillion'}:return 'C1','numeral'
  return ('A2' if re.search(r'th(?:$| )|hundred|thousand|million|billion',k) or k in {'first','second','third'} else 'A1'),'numeral'
 z=freq(k)
 # Frequency supplies a prior, then compound transparency, register, domain and meaning adjust it.
 sc=2 if z>=4.5 else 3 if z>=3.5 else 4 if z>=2.3 else 5
 if oldm and '(оценка)' in oldlevel:sc=levels.index(oldm[0])
 tokens=[x for x in re.findall(r"[a-z]+(?:'[a-z]+)?",k) if x not in stop_en]
 ruwords=words(t);ruroots={parse(x).normal_form for x in ruwords}
 household=bool(ruroots&everyday_nouns)
 if len(tokens)>1:
  # wordfreq approximates unseen phrases from their components; it is not evidence of idiom familiarity.
  sc=max(sc,3)
  known=[min(oxword[x]) for x in tokens if x in oxword]
  allknown=len(known)==len(tokens)
  descriptive=len(tokens)<=3 and typ=='фраза' and len(ruwords)<=5 and not any(x in {'как','что','который','когда','ни','дело'} for x in ruwords)
  if descriptive and allknown and not special:
   # Compound meaning can be nonliteral: lower only mundane object/colour/kinship descriptions.
   if household or set(theme.split('; '))&concrete_context:sc=min(sc,max(2,max(known)+1))
   else:sc=min(sc,max(3,max(known)))
  if typ in {'фраза','фразовый глагол'} and not descriptive:sc=max(3,sc)
  if any(re.search(r'\b'+re.escape(x)+r'\b',k) for x in ['quantum','white hole','black hole']):special=True
 if special:sc=max(sc,4)
 if household and not special and z>=2.5:sc=min(sc,3)
 if re.search(r'устар|архаич|поэтич|диалект|редкое',t):sc=max(sc,4)
 if context and re.search(r'разговор|сленг|жаргон',context[1]):sc=max(sc,3)
 return levels[min(5,max(0,sc))],'assessed'

result=[];seen={};merged=0;methods=collections.Counter();source_rows=[]
for source,r in enumerate(old[1:],2):
 w,t,typ,lv,theme=r
 if w=='to would':continue
 if w=='to misfit' and t.startswith('человек'):w='misfit';typ='существительное'
 if w=='to dying for sth':continue
 ts=split_translation(r[0],t,typ)
 for tr in ts:
  l,method=assess(w,tr,typ,lv,theme)
  row=[w,tr,typ,l,theme]
  ident=(w.lower(),plain(tr),typ,re.findall(r'\([^)]*\)',tr).__str__())
  if ident in seen:
   prev=result[seen[ident]];prev['row'][4]='; '.join(sorted(set(filter(None,(prev['row'][4]+'; '+theme).split('; ')))))
   merged+=1;continue
  seen[ident]=len(result)
  result.append({'row':row,'source_row':source,'note':notes.get(str(source),''),'method':method})
  methods[method]+=1

# Replace the two malformed duplicate headwords removed above with useful everyday entries.
for row in [
 ['phone charger','зарядное устройство для телефона','фраза','B1','Технологии'],
 ['parking ticket','штраф за неправильную парковку','фраза','B1','Путешествия']
]:
 if row[0].lower() not in {x['row'][0].lower() for x in result}:
  result.append({'row':row,'source_row':0,'note':'','method':'editorial'})
  methods['editorial']+=1

if (P/'pair-overrides.json').exists():
 overrides=json.load(open(P/'pair-overrides.json'))
 for x in result:
  r=x['row'];k=key(r[0])+'|'+r[1]+'|'+r[2]
  if k in overrides:r[3]=overrides[k]

summary={'before':len(old)-1,'after':len(result),'unique':len({x['row'][0].lower() for x in result}),'split_sources':len(split_log),'merged':merged,'levels':dict(collections.Counter(x['row'][3] for x in result)),'methods':dict(methods),'themes':dict(collections.Counter(t for x in result for t in x['row'][4].split('; ') if t))}
json.dump(result,open(P/'pairs-assessed.json','w'),ensure_ascii=False)
json.dump([old[0]]+[x['row'] for x in result],open(P/'pairs-values.json','w'),ensure_ascii=False)
json.dump(split_log,open(P/'pairs-splits.json','w'),ensure_ascii=False)
json.dump(ambiguous,open(P/'pairs-ambiguous.json','w'),ensure_ascii=False)
json.dump(summary,open(P/'pairs-summary.json','w'),ensure_ascii=False)
for i in range(0,len(result),1000):json.dump(result[i:i+1000],open(P/f'pairs-write-{i//1000:03}.json','w'),ensure_ascii=False)
print(json.dumps(summary,ensure_ascii=False))
