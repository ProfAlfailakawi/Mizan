import json, base64, os, re, tempfile, threading, time
from difflib import SequenceMatcher
from fastapi import FastAPI, Header, HTTPException, Request

"""
مستمعٌ قرآنيٌّ للتدريب والتتبّع — لا يكتب دليلًا ولا درجة.

كان النموذج يُنزَّل أثناء بناء الصورة، فإن تعثّر التنزيلُ سقط البناءُ كلّه — وسقط معه نشرُ
ميزان بأكمله، فلم يصل المستمعُ إلى الإنتاج قط. الآن يُحمَّل النموذجُ عند إقلاع الخدمة في
خيطٍ خلفيّ، بسلسلة بدائلَ معلنة، والخدمةُ تقول بصدقٍ «أُحمّل» حتى يجهز.
"""

MODEL_CHAIN=[m for m in [
    os.getenv('MIZAN_QURAN_MODEL','').strip(),
    'OdyAsh/faster-whisper-base-ar-quran',
    'Systran/faster-whisper-small',
    'Systran/faster-whisper-base',
] if m]
state={'model':None,'id':None,'error':None,'started':time.time()}

def load_model():
    from faster_whisper import WhisperModel
    errors=[]
    for model_id in dict.fromkeys(MODEL_CHAIN):
        try:
            print(f'loading {model_id}…',flush=True)
            state['model']=WhisperModel(model_id,device='cpu',compute_type='int8',download_root='/models',cpu_threads=int(os.getenv('MIZAN_CPU_THREADS','2')))
            state['id']=model_id; state['error']=None
            print(f'model ready: {model_id}',flush=True)
            return
        except Exception as exc:
            errors.append(f'{model_id}: {exc}')
            print(f'model failed: {model_id}: {exc}',flush=True)
    state['error']=' | '.join(errors)[-600:]

threading.Thread(target=load_model,daemon=True).start()
app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)

DIAC=re.compile(r'[ً-ٰٟۖ-ۭ]')
NON_AR=re.compile(r'[^ء-غف-ي\s]')
def norm(s:str)->str:
    s=DIAC.sub('',s).replace('أ','ا').replace('إ','ا').replace('آ','ا').replace('ٱ','ا').replace('ى','ي').replace('ة','ه').replace('ؤ','و').replace('ئ','ي')
    return ' '.join(NON_AR.sub(' ',s).split())

def decode_expected(value:str):
    try:
        pad='='*((4-len(value)%4)%4)
        data=json.loads(base64.urlsafe_b64decode(value+pad).decode('utf-8'))
        if not isinstance(data,list) or not data: raise ValueError()
        return data
    except Exception as exc:
        raise HTTPException(400,'EXPECTED_PASSAGE_INVALID') from exc

def best_match(transcript:str, ayat:list[dict], after:int=-1):
    """
    يُطابَق **ذيلُ** ما سُمع لا كلُّه.

    فالمقطعُ يصل مسبوقًا بترويسة الملف (أوّل ثانيتين من التلاوة) حتى يُفكّ — فأوّلُ ما يُكتب
    قديم، وآخرُه هو موضعُ القارئ الآن. ويُفضَّل ما بعد آخر موضعٍ معروف، لأنّ القارئ يتقدّم.
    """
    heard=norm(transcript).split()[-10:]
    if not heard:return None,0.0
    words=[]
    for ayah in ayat:
        for idx,w in enumerate(norm(str(ayah.get('text',''))).split(),1):
            words.append((w,int(ayah['surah']),int(ayah['ayah']),idx))
    if not words:return None,0.0
    expected=[w[0] for w in words]
    lo=max(1,len(heard)-3); hi=min(len(expected),len(heard)+4)
    best=(0.0,0,0,0.0)
    for size in range(lo,hi+1):
        for start in range(0,len(expected)-size+1):
            ratio=SequenceMatcher(None,heard,expected[start:start+size],autojunk=False).ratio()
            end=start+size-1
            score=ratio
            if after>=0:
                if end<after-2: score-=0.18
                elif end<=after+len(heard)+6: score+=0.06
            if score>best[3]:best=(ratio,start,size,score)
    ratio,start,size,_=best
    if ratio<0.42:return None,ratio
    end=min(len(words)-1,start+size-1)
    _,surah,ayah,word_index=words[end]
    return {'surah':surah,'ayah':ayah,'wordIndex':word_index,'globalIndex':end},ratio

@app.get('/health')
def health():
    status='ok' if state['model'] else ('failed' if state['error'] else 'loading')
    return {'status':status,'model':state['id'],'error':state['error'],'mode':'PRACTICE_AND_FOLLOW_ONLY'}

@app.post('/listen')
async def listen(request:Request,x_mizan_reading:str=Header(''),x_mizan_expected_passage:str=Header(''),x_mizan_after:str=Header('')):
    # النموذج مقاس لحفص فقط. لا fallback إلى رواية أخرى.
    if x_mizan_reading!='hafs':raise HTTPException(409,'READING_NOT_SUPPORTED')
    model=state['model']
    if model is None:raise HTTPException(503,'MODEL_LOADING' if not state['error'] else 'MODEL_FAILED')
    audio=await request.body()
    if not audio or len(audio)>4_000_000:raise HTTPException(400,'AUDIO_CHUNK_INVALID')
    expected=decode_expected(x_mizan_expected_passage)
    try:after=int(x_mizan_after)
    except ValueError:after=-1
    content_type=request.headers.get('content-type','audio/webm')
    suffix='.ogg' if 'ogg' in content_type else ('.mp4' if 'mp4' in content_type else '.webm')
    path=''
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix,delete=False) as f:
            f.write(audio); path=f.name
        try:
            segments,_=model.transcribe(path,language='ar',beam_size=1,best_of=1,condition_on_previous_text=False,vad_filter=False,without_timestamps=True)
            transcript=' '.join(seg.text for seg in segments).strip()
        except Exception:
            raise HTTPException(422,'AUDIO_UNDECODABLE')
        candidate,confidence=best_match(transcript,expected,after)
        return {'candidate':candidate,'confidence':confidence,'modelVersion':str(state['id']),'transcriptDiscarded':True,'acousticQuality':None}
    finally:
        if path:
            try:os.remove(path)
            except OSError:pass
