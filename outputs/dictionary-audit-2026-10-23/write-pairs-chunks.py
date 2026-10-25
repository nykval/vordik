import json,re,collections
from pathlib import Path
P=Path(__file__).parent
data=json.load(open(P/'pairs-assessed.json'))
out=P/'api-pair-chunks';out.mkdir(exist_ok=True)
size=1000
for i in range(0,len(data),size):
 rows=[]
 for x in data[i:i+size]:
  note=x['note']
  if note:
   lines=note.splitlines()
   note='\n'.join(lines[:2]+['Подробности и лицензии: лист «Источники».'])
  rows.append({'r':x['row'],'n':note})
 (out/f'{i//size:03}.json').write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')))
assert len(data)==len(json.load(open(P/'pairs-values.json')))-1
assert len({x['row'][0].lower() for x in data})==50000
assert len({(x['row'][0].lower(),x['row'][1].lower(),x['row'][2]) for x in data})==len(data)
assert all(re.fullmatch('[ABC][12]',x['row'][3]) and all(x['row'][:3]) for x in data)
print(json.dumps({'chunks':(len(data)+size-1)//size,'rows':len(data),'files_bytes':sum(x.stat().st_size for x in out.glob('*.json'))}))
