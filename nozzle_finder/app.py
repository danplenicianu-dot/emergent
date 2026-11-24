import os,json,urllib.request,re,time,threading,secrets
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from functools import lru_cache
ROOT=Path(__file__).parent
lock=threading.Lock()
last=0
def api(endpoint,payload,key):
 r=urllib.request.Request('https://api.fetchlayer.dev/makerworld/'+endpoint,json.dumps(payload).encode(),{'Authorization':'Bearer '+key,'Content-Type':'application/json'})
 with urllib.request.urlopen(r,timeout=30) as f:return json.load(f)
@lru_cache(maxsize=256)
def detail(mid,key):return api('model-detail',{'model':mid,'printProfileLimit':200},key)
def match(p,nozzle,printer):
 try:n=float(str(p.get('nozzleDiameter','')).replace('mm','').strip())
 except (ValueError,TypeError):return False
 norm=lambda x:re.sub(r'[^a-z0-9]','',str(x).lower().replace('bambu lab',''))
 return n==nozzle and (printer=='all' or norm(p.get('printerModel',''))==norm(printer))
def search(data,key):
 n=float(data['nozzle']);printer=data.get('printer','P2S');q=str(data.get('query','')).strip()
 if n not in (.2,.4,.6,.8) or not q or len(q)>150:raise ValueError('Alege duza si introdu un termen valid.')
 payload={'query':q,'nozzleDiameters':[n],'printableOnly':True,'limit':10,'sortBy':'relevance'}
 if data.get('cursor'):payload['cursor']=data['cursor']
 result=api('search-models',payload,key);models=result.get('models',[]);errors=[]
 def check(m):
  try:
   d=detail(str(m['modelId']),key);full=d['model'];profiles=[p for p in full.get('printProfiles',[]) if match(p,n,printer)]
   if d.get('notes') or full.get('printProfileCount',0)>len(full.get('printProfiles',[])):errors.append('Profiluri posibil incomplete: '+str(m['modelId']))
   if profiles:return {**m,'profiles':profiles}
  except Exception:errors.append('Profiluri indisponibile: '+str(m.get('modelId')))
 with ThreadPoolExecutor(max_workers=3) as pool:found=[x for x in pool.map(check,models[:10]) if x]
 return {'models':found,'checked':len(models[:10]),'cursor':result.get('nextCursor'),'notes':errors}
class Handler(BaseHTTPRequestHandler):
 def send(self,status,body,kind):
  self.send_response(status);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def reply(self,status,data):self.send(status,json.dumps(data).encode(),'application/json')
 def do_GET(self):
  if self.path=='/':self.send(200,(ROOT/'index.html').read_bytes(),'text/html; charset=utf-8')
  elif self.path=='/health':self.send(200,b'ok','text/plain')
  else:self.send(404,b'Not found','text/plain')
 def do_POST(self):
  global last
  if self.path!='/api/search':return self.reply(404,{})
  key=os.getenv('FETCHLAYER_API_KEY','');password=os.getenv('SEARCH_PASSWORD','')
  if not key or not password:return self.reply(503,{'error':'Cautarea live necesita configurarea API si a parolei pe server.'})
  try:
   size=int(self.headers.get('Content-Length',0))
   if not 0<size<16000:raise ValueError()
   data=json.loads(self.rfile.read(size))
   if not secrets.compare_digest(str(data.get('password','')).encode(),password.encode()):return self.reply(403,{'error':'Parola incorecta.'})
   with lock:
    if time.monotonic()-last<15:return self.reply(429,{'error':'Incearca din nou peste 15 secunde.'})
    last=time.monotonic()
   self.reply(200,search(data,key))
  except Exception:self.reply(502,{'error':'Cautarea a esuat. Verifica datele si configurarea API.'})
if __name__=='__main__':ThreadingHTTPServer(('0.0.0.0',int(os.getenv('PORT','8000'))),Handler).serve_forever()
