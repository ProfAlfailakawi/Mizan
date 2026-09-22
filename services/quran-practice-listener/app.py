import base64, json, os, re, tempfile
from difflib import SequenceMatcher
from fastapi import FastAPI, Header, HTTPException, Request
from faster_whisper import WhisperModel

MODEL_ID=os.getenv('MIZAN_QURAN_MODEL','tarteel-ai/whisper-base-ar-quran')
MODEL_REV=os.getenv('MIZAN_QURAN_MODEL_REV','5c3c53f')
model=WhisperModel(MODEL_ID,device='cpu',compute_type='int8',download_root='/models')
app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)

DIAC=re.compile(r'[\u064b-\u065f\u0670]')
NON_AR=re.compile(r'[^\u0621-\u063a\u0641-\u064a\s]')
def norm(s:str)->str:
    s=DIAC.sub('',s).replace('أ','ا').replace('إ','ا').replace('آ','ا').replace('ٱ','ا').replace('ى','ي').replace('ة','ه')
    return ' '.join(NON_AR.sub(' ',s).split())

def decode_expected(value:str):
    try:
        pad='='*((4-len(value)%4)%4)
        data=json.loads(base64.urlsafe_b64decode(value+pad).decode('utf-8'))
        if not isinstance(data,list) or not data: raise ValueError()
        return data
    except Exception as exc:
        raise HTTPException(400,'EXPECTED_PASSAGE_INVALID') from exc

def best_match(transcript:str, ayat:list[dict]):
    heard=norm(transcript).split()
    if not heard:return None,0.0
    words=[]
    for ayah in ayat:
        for idx,w in enumerate(norm(str(ayah.get('text',''))).split(),1):
            words.append((w,int(ayah['surah']),int(ayah['ayah']),idx))
    if not words:return None,0.0
    expected=[w[0] for w in words]
    lo=max(1,len(heard)-3); hi=min(len(expected),len(heard)+5)
    best=(0.0,0,0)
    for size in range(lo,hi+1):
        for start in range(0,len(expected)-size+1):
            ratio=SequenceMatcher(None,heard,expected[start:start+size],autojunk=False).ratio()
            if ratio>best[0]:best=(ratio,start,size)
    ratio,start,size=best
    if ratio<0.42:return None,ratio
    end=min(len(words)-1,start+size-1)
    _,surah,ayah,word_index=words[end]
    return {'surah':surah,'ayah':ayah,'wordIndex':word_index},ratio

@app.get('/health')
def health():return {'status':'ok','model':MODEL_ID,'revision':MODEL_REV,'mode':'PRACTICE_ONLY'}

@app.post('/listen')
async def listen(request:Request,x_mizan_reading:str=Header(''),x_mizan_expected_passage:str=Header('')):
    # هذا النموذج مقاس لحفص فقط في ميزان. لا fallback إلى رواية أخرى.
    if x_mizan_reading!='hafs':raise HTTPException(409,'READING_NOT_SUPPORTED')
    audio=await request.body()
    if not audio or len(audio)>2_000_000:raise HTTPException(400,'AUDIO_CHUNK_INVALID')
    expected=decode_expected(x_mizan_expected_passage)
    content_type=request.headers.get('content-type','audio/webm')
    suffix='.ogg' if 'ogg' in content_type else '.webm'
    path=''
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix,delete=False) as f:
            f.write(audio); path=f.name
        segments,info=model.transcribe(path,language='ar',beam_size=1,best_of=1,condition_on_previous_text=False,vad_filter=True)
        transcript=' '.join(seg.text for seg in segments).strip()
        candidate,confidence=best_match(transcript,expected)
        return {'candidate':candidate,'confidence':confidence,'modelVersion':f'{MODEL_ID}@{MODEL_REV}','transcriptDiscarded':True,'acousticQuality':None}
    finally:
        if path:
            try:os.remove(path)
            except OSError:pass
