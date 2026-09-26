import asyncio, json, base64, os, re, tempfile, threading, time
from contextlib import asynccontextmanager
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
state={'model':None,'id':None,'error':None,'source':None,'started':time.time(),'device':None}
BAKED=os.getenv('MIZAN_BAKED_MODEL_DIR','/models/baked')

def make_model(path_or_id:str,**kw):
    """
    يبني النموذجَ على أفضل عتادٍ حاضر — وأمرُ العتاد بيد النشر لا الشيفرة.

    `MIZAN_LISTENER_DEVICE`:
      ـ `auto` (الأصل): يُجرَّب المعالجُ الرسوميّ (CUDA، بدقّة `MIZAN_GPU_COMPUTE`، الأصلُ float16)
        فإن غاب أو تعثّر عاد إلى المعالج العاديّ (int8) — فالصورةُ الواحدة تصلح للنشرين.
      ـ `cuda`: يُشترط الرسوميُّ ولا رجوع — نشرُ GPU الذي يسقط إلى CPU بصمتٍ يدفع ثمنَ
        الرسوميّ ويعمل ببطء العاديّ، ولا يُكتشف إلا بالقياس.
      ـ `cpu`: العاديُّ صراحةً.

    والفيصلُ المقيس: على CPU يأخذ المقطعُ (١٫٥ ث) نحو ٠٫٥–١٫٢ ث حسابًا للمسارين معًا
    فيتزاحم، وعلى L4 أجزاءَ الثانية — وهو الطريقُ إلى تنبيهٍ في نحو ثانيتين كما يفعل ترتيل
    (docs/LISTENER-GPU.md بالأرقام والكلفة).
    """
    from faster_whisper import WhisperModel
    want=(os.getenv('MIZAN_LISTENER_DEVICE','auto').strip() or 'auto').lower()
    if want in ('auto','cuda'):
        try:
            model=WhisperModel(path_or_id,device='cuda',compute_type=os.getenv('MIZAN_GPU_COMPUTE','float16').strip() or 'float16',**kw)
            state['device']='cuda'
            return model
        except Exception as exc:
            if want=='cuda':raise
            print(f'cuda unavailable, using cpu: {exc}',flush=True)
    model=WhisperModel(path_or_id,device='cpu',compute_type='int8',cpu_threads=int(os.getenv('MIZAN_CPU_THREADS','2')),**kw)
    state['device']='cpu'
    return model


def load_model():
    # تعثّرٌ عابرٌ في التنزيل لا يُعطّل الخدمةَ إلى الأبد: تُعاد المحاولة بمهلٍ متزايدة.
    delay=10
    while state['model'] is None:
        try_models()
        if state['model'] is not None:return
        print(f'all models failed; retrying in {delay}s',flush=True)
        time.sleep(delay);delay=min(delay*2,300)

def try_models():
    errors=[]
    for model_id in dict.fromkeys(MODEL_CHAIN):
        try:
            print(f'loading {model_id}…',flush=True)
            state['model']=make_model(model_id,download_root='/models')
            state['id']=model_id; state['error']=None; state['source']='download'
            print(f'model ready: {model_id}',flush=True)
            return
        except Exception as exc:
            errors.append(f'{model_id}: {exc}')
            print(f'model failed: {model_id}: {exc}',flush=True)
    state['error']=' | '.join(errors)[-600:]

def load_prefetched()->bool:
    """
    النموذجُ المخبوزُ في الصورة يُحمَّل قبل أن تُفتح الخدمةُ للطلبات — من القرص، بلا شبكة.

    كان التحميلُ كلُّه في خيطٍ خلفيّ يبدأ مع الإقلاع، والخدمةُ تفتح منفذَها فورًا. وCloud Run
    (بلا `--no-cpu-throttling`) لا يعطي الحاويةَ معالجًا إلا ما دام طلبٌ يُخدَم أو هي تُقلع —
    فيُخنق الخيطُ بعد ثانيتين من الإقلاع ولا يتقدّم إلا في لحظات طلبات الصحّة: فيبقى المستمعُ
    «يستعدّ» دقائق بعد كل نشرٍ وكل نوم (رُصد في نشر a879e6e: LOADING ثماني مرّات في دقيقتين).
    الآن يُحمَّل في طور الإقلاع نفسه، بالمعالج كاملًا ومعه `--cpu-boost`، ولا يُفتح المنفذ حتى
    يجهز — فأوّلُ طلبٍ ينتظر ثوانيَ الإقلاع بدل دقائق «يستعدّ». ولا كلفةَ فوق ما كان.
    """
    # المجلّدُ المخبوز (prefetch.py): نُزِّل وحُمِّل في البناء نفسه، فلا مخبأَ ولا شبكة.
    try:
        with open(os.path.join(BAKED,'MODEL_ID'),encoding='utf-8') as f:model_id=f.read().strip()
        state['model']=make_model(BAKED)
        state['id']=model_id; state['error']=None; state['source']='image'
        print(f'model ready from image: {model_id}',flush=True)
        return True
    except Exception as exc:
        print(f'no baked model: {exc}',flush=True)
    for model_id in dict.fromkeys(MODEL_CHAIN):
        try:
            state['model']=make_model(model_id,download_root='/models',local_files_only=True)
            state['id']=model_id; state['error']=None; state['source']='image'
            print(f'model ready from image cache: {model_id}',flush=True)
            return True
        except Exception as exc:
            print(f'not in image: {model_id}: {exc}',flush=True)
    return False

@asynccontextmanager
async def lifespan(_app):
    # وإن لم يكن في الصورة نموذجٌ (تعثّر التنزيلُ المسبق) نُزِّل في الخلفية كما كان، والصحّةُ تقول «أُحمّل».
    # وإن غاب عن الصورة نُزِّل في طور الإقلاع أيضًا (بالمعالج كاملًا) في مهلةٍ محدودة؛ فإن جاوزها
    # أكمل الخيطُ نفسُه في الخلفية — ولا يُعاد التنزيلُ من أوّله.
    #
    # المنفذُ يُفتح فورًا، والنموذجُ يُحمَّل في خيطٍ يبدأ الآن. وCloud Run يسأل `/ready` (مجسُّ
    # الإقلاع في cloudbuild.yaml) ولا يعدّ النسخةَ «مُقلعة» حتى يجيب بـ200 — وطوالَ ذلك تُعطى
    # الحاويةُ معالجَها كاملًا (مع `--cpu-boost`). فلا يُخنق التحميلُ، ولا تُرسل حركةٌ قبل النموذج.
    #
    # وكان التحميلُ قبل فتح المنفذ: فتجاوز مهلةَ مجسّ TCP الافتراضيّ (٢٤٠ ثانية)، فسقطت كلُّ نسخةٍ
    # جديدة بـ`HealthCheckContainerError` وبقيت الحركةُ على نسخةٍ قديمةٍ «تُحمّل» إلى الأبد.
    threading.Thread(target=startup_load,daemon=True).start()
    yield

def startup_load():
    started=time.time()
    print('listener startup: loading model…',flush=True)
    try:
        if not load_prefetched():
            load_model()
    except Exception as exc:
        # لا يموت الخيطُ صامتًا: الخطأ يُحفظ فتقوله `/health` و`/ready` (كان استيرادٌ ناقص يُبقيه «يُحمّل» أبدًا).
        state['error']=f'{type(exc).__name__}: {exc}'[-600:]; state['failed']=True
        print(f'listener startup failed: {state["error"]}',flush=True)
        return
    print(f'listener startup: model {state["id"]} ready from {state["source"]} in {time.time()-started:.1f}s',flush=True)

app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None,lifespan=lifespan)

READING_ID=re.compile(r'[a-z][a-z-]{1,39}')
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

# عتباتُ المطابقة: قربَ آخر موضعٍ مُثبَت تكفي مطابقةٌ معقولة؛ والقفزُ بعيدًا يحتاج دليلًا قويًّا.
LOCAL_BEHIND, LOCAL_AHEAD = 8, 12
LOCAL_MIN_RATIO, FAR_MIN_RATIO = 0.5, 0.65

def best_match(transcript:str, ayat:list[dict], after:int=-1):
    """
    يُطابَق **ذيلُ** ما سُمع لا كلُّه — ويرسو على آخر موضعٍ مُثبَت.

    فالمقطعُ يصل مسبوقًا بترويسة الملف (أوّل ثانيتين من التلاوة) حتى يُفكّ — فأوّلُ ما يُكتب
    قديم، وآخرُه هو موضعُ القارئ الآن.

    ومع `after` (آخرُ موضعٍ مُثبَت) يُبحث أوّلًا في نافذةٍ حوله (ثماني كلماتٍ خلفه واثنتا عشرة
    أمامه)، ولا يُقبل موضعٌ أبعدُ منها إلا بمطابقةٍ قويّة: فعبارةٌ تتكرّر («فبأيّ آلاء ربّكما
    تكذّبان») أو آيةٌ متشابهةٌ بعيدة لا تسحب الموضعَ إليها بمطابقةٍ ضعيفة — ولا تكشف ما لم يُقرأ.
    وعند التساوي يُختار الأقربُ إلى آخر موضع.
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

    def search(end_lo:int, end_hi:int):
        best=None
        for size in range(lo,hi+1):
            for start in range(max(0,end_lo-size+1),min(len(expected)-size,end_hi-size+1)+1):
                end=start+size-1
                if end<end_lo or end>end_hi:continue
                ratio=SequenceMatcher(None,heard,expected[start:start+size],autojunk=False).ratio()
                distance=abs(end-after) if after>=0 else 0
                key=(round(ratio,3),-distance)
                if best is None or key>best[0]:best=(key,ratio,start,size)
        return best

    found=None
    if after>=0:
        local=search(max(0,after-LOCAL_BEHIND),min(len(expected)-1,after+LOCAL_AHEAD))
        if local and local[1]>=LOCAL_MIN_RATIO:found=local
    if found is None:
        far=search(0,len(expected)-1)
        threshold=FAR_MIN_RATIO if after>=0 else LOCAL_MIN_RATIO
        if far and far[1]>=threshold:found=far
    if found is None:return None,0.0
    _,ratio,start,size=found
    end=min(len(words)-1,start+size-1)
    _,surah,ayah,word_index=words[end]
    return {'surah':surah,'ayah':ayah,'wordIndex':word_index,'globalIndex':end},ratio

def after_header(temp,audio:bytes,head_len:int):
    """
    الصوتُ بعد الترويسة، مفكوكًا — والترويسةُ نفسُها لا تُسمع.

    المقطعُ يصل مسبوقًا بأوّل مقطعٍ في التلاوة حتى يُفكّ. فكانت الترويسةُ تُكتب مع ما بعدها
    ثم تُطرح كلماتُها — كتابةٌ تُضاعف الحساب، وحين تُكتب بلا توقيتٍ يُطابَق ذيلُها أوّلَ المقطع
    فيقفز الموضع (MIZAN-LISTENER-FOLLOW-1). والآن يُفكّ الملفُّ كلُّه، ويُقصّ منه طولُ
    الترويسة، ولا يُكتب إلا ما بعدها: أرخصُ، ولا ترويسةَ في المسموع أصلًا.
    """
    from faster_whisper.audio import decode_audio
    pcm=decode_audio(temp(audio))
    if head_len and head_len<len(audio):
        try:head=len(decode_audio(temp(audio[:head_len])))
        except Exception:head=0
        # وإن لم يبقَ بعد الترويسة شيء (مقطعٌ أخيرٌ قصير) فالمسموعُ فارغ — لا تُسمع الترويسةُ مكانه.
        if 0<head<=len(pcm):pcm=pcm[head:]
    return pcm

@app.get('/ready')
def ready():
    # مجسُّ الإقلاع: ٢٠٠ حين يجهز النموذج وحده. وحتى ذلك لا تُعدّ النسخةُ مُقلعة، فلا حركةَ إليها.
    from fastapi.responses import JSONResponse
    return JSONResponse({'ready':bool(state['model']),'error':state['error']},status_code=200 if state['model'] else 503)

@app.get('/health')
def health():
    from fastapi.responses import JSONResponse
    # `failed`: خيطُ التحميل انتهى بلا نموذج ولن يعيد — فيُقال «معطّل» لا «يُعيد المحاولة».
    status='ok' if state['model'] else ('failed' if state.get('failed') else 'retrying' if state['error'] else 'loading')
    # `source`: من الصورة (إقلاعٌ في ثوانٍ) أو من الشبكة (الصورةُ بلا نموذج — يُرى في ملخّص النشر).
    # `build`: الـcommit الذي بُنيت منه النسخةُ العاملة — فلا يُظنّ الإصلاحُ منشورًا وهو لم يُنشر.
    body={'status':status,'model':state['id'],'error':state['error'],'source':state['source'],'device':state['device'],
          'build':os.getenv('MIZAN_BUILD_SHA') or None,'mode':'PRACTICE_AND_FOLLOW_ONLY'}
    # لا «سليم» قبل أن يجهز النموذج: الصحّةُ تقول الحقيقة لمن يسأل.
    return JSONResponse(body,status_code=200 if state['model'] else 503)

@app.post('/listen')
async def listen(request:Request,x_mizan_reading:str=Header(''),x_mizan_expected_passage:str=Header(''),x_mizan_after:str=Header(''),x_mizan_head_bytes:str=Header('0')):
    # النموذجُ يسمع الأصوات؛ والنصُّ المقابَل به نصُّ رواية المتسابق نفسها (يُرسل مع الطلب).
    if not READING_ID.fullmatch(x_mizan_reading or ''):raise HTTPException(409,'READING_NOT_SUPPORTED')
    model=state['model']
    if model is None:raise HTTPException(503,'MODEL_LOADING' if not state['error'] else 'MODEL_FAILED')
    audio=await request.body()
    if not audio or len(audio)>4_000_000:raise HTTPException(400,'AUDIO_CHUNK_INVALID')
    expected=decode_expected(x_mizan_expected_passage)
    try:after=int(x_mizan_after)
    except ValueError:after=-1
    try:head_len=max(0,min(len(audio),int(x_mizan_head_bytes)))
    except ValueError:head_len=0
    content_type=request.headers.get('content-type','audio/webm')
    suffix='.ogg' if 'ogg' in content_type else ('.mp4' if 'mp4' in content_type else '.webm')
    paths=[]
    def temp(data:bytes)->str:
        with tempfile.NamedTemporaryFile(suffix=suffix,delete=False) as f:
            f.write(data);paths.append(f.name);return f.name
    try:
        # الترويسةُ أوّلُ التلاوة تُرسل ليُفكّ الصوت — وكلماتُها ليست موضعَ القارئ الآن. فكان ذيلُ
        # ما سُمع يحملها حين يقصر المقطعُ أو يصمت، فيُطابَق أوّلَ المقطع ويقفز الموضعُ إليه
        # (قيس: ٨١ قفزةً في MIZAN-LISTENER-FOLLOW-1، أكثرُها في الفاتحة وأوّل البقرة).
        try:
            pcm=after_header(temp,audio,head_len)
            segments=[] if len(pcm)==0 else model.transcribe(pcm,language='ar',beam_size=1,best_of=1,condition_on_previous_text=False,vad_filter=True,vad_parameters={'min_silence_duration_ms':300},without_timestamps=True)[0]
            transcript=' '.join(seg.text for seg in segments).strip()
        except Exception:
            raise HTTPException(422,'AUDIO_UNDECODABLE')
        candidate,confidence=best_match(transcript,expected,after)
        return {'candidate':candidate,'confidence':confidence,'modelVersion':str(state['id']),'transcriptDiscarded':True,'acousticQuality':None}
    finally:
        for p in paths:
            try:os.remove(p)
            except OSError:pass


@app.post('/recognise')
async def recognise(request:Request,x_mizan_reading:str=Header(''),x_mizan_head_bytes:str=Header('0')):
    """
    ما قيل، كلمةً كلمة، بتوقيتٍ من أوّل ما بعد الترويسة.

    المقطعُ يصل مسبوقًا بترويسة الملف (أوّلُ مقطعٍ في التلاوة) حتى يُفكّ. فتُقاس مدّةُ
    الترويسة وتُطرح كلماتُها، ويعود التوقيتُ منسوبًا إلى ما بعدها — والعميلُ يُسنده إلى
    أوّل التلاوة ويُثبّت ما استقرّ منه.
    """
    if not READING_ID.fullmatch(x_mizan_reading or ''):raise HTTPException(409,'READING_NOT_SUPPORTED')
    model=state['model']
    if model is None:raise HTTPException(503,'MODEL_LOADING')
    audio=await request.body()
    if not audio or len(audio)>4_000_000:raise HTTPException(400,'AUDIO_CHUNK_INVALID')
    try:head_len=max(0,min(len(audio),int(x_mizan_head_bytes)))
    except ValueError:head_len=0
    content_type=request.headers.get('content-type','audio/webm')
    suffix='.ogg' if 'ogg' in content_type else ('.mp4' if 'mp4' in content_type else '.webm')
    paths=[]
    def temp(data:bytes)->str:
        with tempfile.NamedTemporaryFile(suffix=suffix,delete=False) as f:
            f.write(data);paths.append(f.name);return f.name
    try:
        try:
            # ما بعد الترويسة وحده يُكتب (`after_header`)، فتوقيتُ الكلمات منه مباشرة.
            pcm=after_header(temp,audio,head_len)
            segments=[] if len(pcm)==0 else model.transcribe(pcm,language='ar',beam_size=1,best_of=1,condition_on_previous_text=False,vad_filter=True,vad_parameters={'min_silence_duration_ms':300},word_timestamps=True)[0]
            words=[]
            for seg in segments:
                for w in (seg.words or []):
                    text=w.word.strip()
                    if not text:continue
                    words.append({'text':text,'confidence':max(0.0,min(1.0,float(w.probability))),
                                  'startMs':max(0,int(w.start*1000)),'endMs':max(0,int(w.end*1000))})
        except Exception:
            raise HTTPException(422,'AUDIO_UNDECODABLE')
        return {'reading':x_mizan_reading,'modelVersion':str(state['id']),'words':words[:200]}
    finally:
        for p in paths:
            try:os.remove(p)
            except OSError:pass
