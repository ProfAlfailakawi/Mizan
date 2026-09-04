/* Mizan · Spatial Broadcast Engine — self-contained demo.
   Faithful to project principles: alignment is SHADOW-only and never changes a score;
   the passage text and waqf marks here are illustrative — in production they are loaded
   from a certified KFGQPC source package. */

'use strict';

/* Passage: Surah Al-Fatiha (universally verified text, used only as illustrative content).
   Each token carries a display word and its dwell duration (ms) at reference tempo.
   `ayahEnd` closes an ayah; optional `waqf` and `reading` events fire when the word lands. */
const PASSAGE = [
  { w:'بِسْمِ',        ms:620 },
  { w:'اللَّهِ',       ms:600 },
  { w:'الرَّحْمَٰنِ',   ms:820 },
  { w:'الرَّحِيمِ',     ms:900, ayahEnd:1,
    waqf:{ kind:'kafi', ar:'وقف كافٍ', desc:'يحسُن الوقف والابتداء بما بعده لتمام المعنى مع بقاء التعلّق اللفظي.' } },

  { w:'الْحَمْدُ',      ms:640 },
  { w:'لِلَّهِ',        ms:560 },
  { w:'رَبِّ',         ms:520 },
  { w:'الْعَالَمِينَ',   ms:980, ayahEnd:2,
    waqf:{ kind:'tam', ar:'وقف تام', desc:'تمّ المعنى ولا تعلّق لِما بعده بما قبله.' } },

  { w:'الرَّحْمَٰنِ',    ms:760 },
  { w:'الرَّحِيمِ',     ms:880, ayahEnd:3,
    waqf:{ kind:'tam', ar:'وقف تام', desc:'تمّ المعنى؛ يجوز الابتداء بما بعده.' } },

  { w:'مَٰلِكِ',        ms:640,
    reading:{ ar:'حفص: «مَٰلِكِ» بإثبات الألف', en:'Ḥafṣ: “Mālik” with an alif' } },
  { w:'يَوْمِ',        ms:540 },
  { w:'الدِّينِ',       ms:900, ayahEnd:4,
    waqf:{ kind:'tam', ar:'وقف تام', desc:'انتهى المعنى المستقل.' } },

  { w:'إِيَّاكَ',       ms:640 },
  { w:'نَعْبُدُ',       ms:640 },
  { w:'وَإِيَّاكَ',      ms:640 },
  { w:'نَسْتَعِينُ',     ms:980, ayahEnd:5,
    waqf:{ kind:'tam', ar:'وقف تام', desc:'تمّ المعنى.' } },

  { w:'اهْدِنَا',       ms:640 },
  { w:'الصِّرَٰطَ',      ms:680 },
  { w:'الْمُسْتَقِيمَ',   ms:980, ayahEnd:6,
    waqf:{ kind:'tam', ar:'وقف تام', desc:'تمّ المعنى.' } },

  { w:'صِرَٰطَ',        ms:620 },
  { w:'الَّذِينَ',       ms:600 },
  { w:'أَنْعَمْتَ',      ms:640 },
  { w:'عَلَيْهِمْ',      ms:720 },
  { w:'غَيْرِ',         ms:520 },
  { w:'الْمَغْضُوبِ',    ms:820 },
  { w:'عَلَيْهِمْ',      ms:720 },
  { w:'وَلَا',          ms:440 },
  { w:'الضَّآلِّينَ',     ms:1200, ayahEnd:7,
    waqf:{ kind:'lazim', ar:'وقف لازم', desc:'يلزم الوقف هنا؛ وصله قد يوهم معنى غير مراد.' } },
];

const WAQF_GLYPH = { tam:'ۘ', kafi:'ۖ', hasan:'ۖ', lazim:'ۘ' };

const I18N = {
  ar:{ engine:'محرك البث الحجمي', shadow:'SHADOW · لا يمس الدرجة', riwayah:'الرواية',
       readingFeature:'خصوصية الرواية', humanOnly:'القرار للمحكم', madinah:'مصحف المدينة · صفحة ١',
       live:'بثّ مباشر', simLost:'محاكاة فقد المحاذاة', simFound:'استعادة المحاذاة',
       waqfSource:'علامات الوقف · مصدر رسمي',
       states:{ LOCKED:'مُقفَلة', PROBABLE:'مُرجَّحة', LOST:'مفقودة' },
       note:'عرض توضيحي بيانياً. في التشغيل الرسمي يُحمَّل نصّ المصحف وعلامات الوقف من حزمة مصدر معتمدة (KFGQPC)، والمحاذاة الصوتية تعمل في وضع الظل ولا تغيّر أي درجة إطلاقاً.',
       surah:'سورة الفاتحة', range:'الآيات ١ – ٧', name:'المتسابق · رمز ٠٤٢', cat:'الفئة الأولى · الحفظ الكامل', mizan:'ميزان' },
  en:{ engine:'Spatial Broadcast Engine', shadow:'SHADOW · never scores', riwayah:'Reading',
       readingFeature:'Reading feature', humanOnly:'Judge decides', madinah:'Madinah Muṣḥaf · p.1',
       live:'LIVE', simLost:'Simulate alignment loss', simFound:'Reacquire alignment',
       waqfSource:'Waqf marks · official source',
       states:{ LOCKED:'Locked', PROBABLE:'Probable', LOST:'Lost' },
       note:'Illustrative visualization. In production the Muṣḥaf text and waqf marks load from a certified KFGQPC source package, and audio alignment runs in shadow mode — it never changes any score.',
       surah:'Sūrat al-Fātiḥah', range:'Ayat 1 – 7', name:'Reciter · Code 042', cat:'Tier 1 · Full memorization', mizan:'MIZAN' },
};

const TOTAL = PASSAGE.reduce((s,t)=>s+t.ms, 0);
const RESOLUTION = 1000;

let lang = 'ar';
let playing = false;
let elapsed = 0;          // ms into the passage
let lastTick = 0;
let lostForced = false;   // manual "simulate loss"
let raf = null;

const $ = s => document.querySelector(s);
const stage = $('#stage'), mushaf = $('#mushaf'), scrub = $('#scrub');
const waqfRibbon = $('#waqfRibbon'), rgFlash = $('#rgFlash'), rgFlashText = $('#rgFlashText');
const amState = $('#amState'), amFill = $('#amFill'), alignMeter = $('#alignMeter');
const btnPlay = $('#btnPlay'), btnRestart = $('#btnRestart'), btnLost = $('#btnLost'), btnLang = $('#btnLang');

let ayahCounter = 0;
let flashTimer = null;

/* ---- build the mushaf tokens once ---- */
function buildMushaf(){
  mushaf.innerHTML = '';
  ayahCounter = 0;
  PASSAGE.forEach((t, i) => {
    const span = document.createElement('span');
    span.className = 'tok';
    span.dataset.i = i;
    span.textContent = t.w;
    mushaf.appendChild(span);
    mushaf.appendChild(document.createTextNode(' '));
    if (t.ayahEnd){
      const num = document.createElement('span');
      num.className = 'ayah-num';
      num.textContent = '﴿' + toArabicDigits(t.ayahEnd) + '﴾';
      mushaf.appendChild(num);
      mushaf.appendChild(document.createTextNode(' '));
    }
  });
}

function toArabicDigits(n){ return String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[d]); }

/* ---- map elapsed ms -> active token index + progress within it ---- */
function locate(ms){
  let acc = 0;
  for (let i=0;i<PASSAGE.length;i++){
    if (ms < acc + PASSAGE[i].ms) return { idx:i, within:(ms-acc)/PASSAGE[i].ms };
    acc += PASSAGE[i].ms;
  }
  return { idx:PASSAGE.length-1, within:1 };
}

/* ---- synthetic shadow-mode confidence: dips near word boundaries, honest LOST states ---- */
function confidenceAt(idx, within){
  // natural dip at the seam between words (re-acquiring the pointer)
  const seam = Math.min(within, 1-within);
  let c = 0.72 + 0.26 * Math.min(1, seam*4);
  // scripted uncertainty around the mutashabihat-style repeat "الرحمن الرحيم" (idx 8-9)
  if (idx===8 || idx===9) c -= 0.16;
  return Math.max(0.28, Math.min(0.99, c));
}

let lastAyahShown = 0;
function render(){
  const { idx, within } = locate(elapsed);
  const toks = mushaf.querySelectorAll('.tok');

  toks.forEach((el,i)=>{
    el.classList.toggle('spoken', i < idx);
    el.classList.toggle('active', i === idx);
  });

  // confidence + alignment state
  let conf = confidenceAt(idx, within);
  let state = conf > 0.6 ? 'LOCKED' : 'PROBABLE';
  if (lostForced){ conf = 0.18; state = 'LOST'; }
  const t = I18N[lang];
  amState.textContent = t.states[state];
  amFill.style.width = Math.round(conf*100) + '%';
  const lost = state === 'LOST';
  alignMeter.classList.toggle('lost', lost);
  // faithful behaviour: when alignment is lost, the on-air pointer fades rather than jumping
  mushaf.classList.toggle('lost', lost);

  // scrub position
  const p = elapsed/TOTAL;
  scrub.value = Math.round(p*RESOLUTION);
  scrub.style.setProperty('--p', (p*100)+'%');

  // waqf ribbon: show while sitting on a token that ends an ayah with a waqf
  const cur = PASSAGE[idx];
  if (cur.waqf && within > 0.45 && !lost){
    showWaqf(cur.waqf);
  } else if (!cur.waqf || within < 0.2){
    hideWaqf();
  }

  // reading-feature flash
  if (cur.reading && within > 0.3 && within < 0.9 && !lost){
    showReadingFlash(cur.reading);
  }
}

let waqfKey = '';
function showWaqf(w){
  const key = w.ar + w.kind;
  if (key === waqfKey && !waqfRibbon.hidden) return;
  waqfKey = key;
  waqfRibbon.hidden = false;
  waqfRibbon.dataset.kind = w.kind;
  $('#wrGlyph').textContent = WAQF_GLYPH[w.kind] || 'ۘ';
  $('#wrKind').textContent = lang==='ar' ? w.ar : englishWaqf(w.kind);
  $('#wrDesc').textContent = lang==='ar' ? w.desc : englishWaqfDesc(w.kind);
}
function hideWaqf(){ if(!waqfRibbon.hidden){ waqfRibbon.hidden = true; waqfKey=''; } }

function englishWaqf(k){ return {tam:'Complete stop (tām)',kafi:'Sufficient stop (kāfī)',hasan:'Good stop (ḥasan)',lazim:'Obligatory stop (lāzim)'}[k]||''; }
function englishWaqfDesc(k){ return {
  tam:'The meaning is complete; what follows does not depend on it.',
  kafi:'A sound place to stop and to resume; meaning complete, wording still linked.',
  hasan:'A good place to stop, though what follows is connected.',
  lazim:'A stop is required here; continuing could imply an unintended meaning.'
}[k]||''; }

function showReadingFlash(r){
  if (rgFlash.dataset.k === r.ar) return;
  rgFlash.dataset.k = r.ar;
  rgFlash.hidden = false;
  rgFlashText.textContent = lang==='ar' ? r.ar : r.en;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(()=>{ rgFlash.hidden = true; rgFlash.dataset.k=''; }, 2600);
}

/* ---- loop ---- */
function tick(now){
  if (playing){
    const dt = now - lastTick;
    lastTick = now;
    elapsed += dt;
    if (elapsed >= TOTAL){ elapsed = TOTAL; setPlaying(false); }
    render();
  }
  raf = requestAnimationFrame(tick);
}

function setPlaying(v){
  playing = v;
  document.body.classList.toggle('playing', v);
  if (v){
    if (elapsed >= TOTAL) elapsed = 0;
    lastTick = performance.now();
  }
}

/* ---- i18n ---- */
function applyLang(){
  const t = I18N[lang];
  document.documentElement.lang = lang;
  document.documentElement.dir = lang==='ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const k = el.getAttribute('data-i18n');
    if (t[k]) el.textContent = t[k];
  });
  btnLang.textContent = lang==='ar' ? 'EN' : 'ع';
  btnLost.textContent = lostForced ? t.simFound : t.simLost;
  $('#phSurah').textContent = t.surah;
  $('#phRange').textContent = t.range;
  $('#ltName').textContent = t.name;
  $('#ltCat').textContent = t.cat;
  $('.lt-mizan').textContent = t.mizan;
  waqfKey=''; rgFlash.dataset.k='';
  render();
}

/* ---- events ---- */
btnPlay.addEventListener('click', ()=> setPlaying(!playing));
btnRestart.addEventListener('click', ()=>{ elapsed = 0; hideWaqf(); rgFlash.hidden=true; setPlaying(true); render(); });
btnLost.addEventListener('click', ()=>{ lostForced = !lostForced; btnLost.textContent = lostForced ? I18N[lang].simFound : I18N[lang].simLost; render(); });
btnLang.addEventListener('click', ()=>{ lang = lang==='ar' ? 'en' : 'ar'; applyLang(); });
scrub.addEventListener('input', ()=>{ elapsed = (scrub.value/RESOLUTION)*TOTAL; render(); });
document.addEventListener('keydown', e=>{ if(e.code==='Space'){ e.preventDefault(); setPlaying(!playing); } });

/* ---- boot ---- */
buildMushaf();
applyLang();
render();
raf = requestAnimationFrame(tick);
