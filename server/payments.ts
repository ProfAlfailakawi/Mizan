import crypto from 'crypto';
import { majorStringToPlatformMinor, isoMinorToPlatformMinor, platformMinorToIsoMinor, platformMinorToMajorString } from '../shared/currency';

/*
 * طبقة الدفع المحايدة — بلا أي بوابة مكتوبة في الكود.
 *
 * ميزان يعرف عقدًا واحدًا: «أنشئ عملية دفع» و«تحقّق من إشعار السداد». أما شكل الطلب والرد
 * والتوقيع فيصفه **ملفُّ إعداد** يأتي من البيئة. لذلك تُضاف أي بوابة — مهما كثر عددها —
 * بضبط متغيّرات بيئة فقط، دون تعديل سطر واحد هنا ودون نشر جديد للتطبيق.
 *
 * الأسرار لا تُوضع في الملف: يشير إليها بـ ${apiKey} و ${webhookSecret} وتُقرأ من البيئة.
 */

export interface CheckoutRequest{
  invoiceId:string;
  invoiceNumber:string;
  amountMinor:number;
  currency:string;
  description:string;
  customer?:{name?:string;email?:string;phone?:string};
  callbackUrl:string;
  errorUrl:string;
  /** عنوان إشعار السداد لهذه البوابة، لبواباتٍ تستقبله مع كل عملية (Tap: post.url). */
  webhookUrl?:string;
}
export interface CheckoutResult{paymentUrl:string;externalRef:string}
/** نتيجة إشعار البوابة بعد نجاح التحقق من توقيعه. */
export interface WebhookSettlement{externalRef:string;status:'paid'|'failed'|'pending';amountMinor?:number;currency?:string;paidAt?:string;method?:string}

export interface PaymentGateway{
  readonly name:string;
  createCheckout(input:CheckoutRequest):Promise<CheckoutResult>;
  /** null تعني فشل التحقق من التوقيع، ويُرفض الإشعار حينها. */
  verifyWebhook(headers:Record<string,unknown>,rawBody:Buffer):WebhookSettlement|null;
  /** يسأل البوابة نفسها بالمفتاح السرّي عن حالة العملية. متاح حين يصف الملف statusQuery. */
  queryStatus?(externalRef:string,currency:string):Promise<WebhookSettlement|null>;
  /** يستخرج مرجع العملية من إشعارٍ غير موقَّع، ليُتحقَّق منه بالاستعلام لا بالثقة. */
  referenceFromNotification?(rawBody:Buffer):string|null;
}

/** ناقل HTTP قابل للحقن: البوابات التي تعدّها الجهات تمرّ عبر ناقلٍ يمنع الشبكة الداخلية. */
export type GatewayTransport=(url:string,init:{method:string;headers:Record<string,string>;body?:string})=>Promise<{status:number;text:string}>;
const defaultTransport:GatewayTransport=async(url,init)=>{const res=await fetch(url,init);return {status:res.status,text:await res.text()}};

/** وصف البوابة كما يأتي من الإعداد. كل الحقول اختيارية عدا ما يلزم لإتمام العملية. */
export interface PaymentProviderProfile{
  name?:string;
  checkout:{
    url:string;
    method?:string;
    headers?:Record<string,string>;
    body?:unknown;
    /** json افتراضًا؛ form لبواباتٍ تطلب application/x-www-form-urlencoded (Stripe). */
    bodyEncoding?:'json'|'form';
    /** مسار نقطي داخل رد البوابة، مثل "Data.InvoiceURL" أو "transaction.url". */
    paymentUrlPath:string;
    referencePath:string;
  };
  webhook?:{
    signatureHeader?:string;
    algorithm?:string;
    encoding?:'base64'|'hex';
    /** ما الذي يُوقَّع: الجسم الخام افتراضًا، أو قالب نصّي من حقول الإشعار. */
    signedPayload?:string;
    referencePath:string;
    statusPath?:string;
    amountPath?:string;
    /** الحقل بالوحدة الكبرى (دينار) افتراضًا؛ اجعله true إن أرسلت البوابة الوحدة الصغرى (فلس). */
    amountIsMinor?:boolean;
    currencyPath?:string;
    paidAtPath?:string;
    methodPath?:string;
    paidValues?:string[];
    failedValues?:string[];
  };
  /**
   * الاستعلام عن حالة العملية من البوابة بالمفتاح السرّي — أوثق من الإشعار لأن المصدر هو
   * البوابة نفسها عبر TLS. ${externalRef} متاح في url والجسم.
   */
  statusQuery?:{
    url:string;
    method?:string;
    headers?:Record<string,string>;
    body?:unknown;
    bodyEncoding?:'json'|'form';
    statusPath:string;
    referencePath?:string;
    amountPath?:string;
    /** 'major' افتراضًا (5.250)، أو 'iso_minor' (5250 فلسًا)، أو 'platform_minor'. */
    amountUnit?:'major'|'iso_minor'|'platform_minor';
    currencyPath?:string;
    paidAtPath?:string;
    methodPath?:string;
    paidValues?:string[];
    failedValues?:string[];
  };
  /** مسار المرجع داخل إشعارٍ بلا توقيع يُستعلم عنه (MyFatoorah: Data.InvoiceId). */
  notificationReferencePath?:string;
}

const pathGet=(source:unknown,dotted:string):unknown=>
  String(dotted||'').split('.').filter(Boolean).reduce<unknown>((acc,key)=>(acc&&typeof acc==='object')?(acc as Record<string,unknown>)[key]:undefined,source);

const headerValue=(headers:Record<string,unknown>,name:string)=>{
  const v=headers[String(name||'').toLowerCase()];
  return Array.isArray(v)?String(v[0]??''):v===undefined?'':String(v);
};

/* مقارنة بزمن ثابت: مقارنة النصوص العادية تسرّب مقدار التطابق. */
const safeEqual=(a:string,b:string)=>{
  const x=Buffer.from(String(a)),y=Buffer.from(String(b));
  return x.length>0&&x.length===y.length&&crypto.timingSafeEqual(x,y);
};

/** يستبدل ${...} داخل النصوص، ويسري على الكائنات والمصفوفات بعمق. */
export function renderTemplate(value:unknown,vars:Record<string,string>):unknown{
  if(typeof value==='string'){
    /* قيمةٌ كاملة بصيغة ${name|number} تُرسل عددًا لا نصًّا — بعض البوابات ترفض "5.250" نصًّا. */
    const whole=/^\$\{([a-zA-Z0-9_.]+)(\|number)?\}$/.exec(value.trim());
    if(whole){const v=vars[whole[1]]??'';if(whole[2]){const n=Number(v);return v!==''&&Number.isFinite(n)?n:v}return v}
    return value.replace(/\$\{([a-zA-Z0-9_.]+)(?:\|number)?\}/g,(_m,k)=>vars[k]??'');
  }
  if(Array.isArray(value))return value.map(v=>renderTemplate(v,vars));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([k,v])=>[k,renderTemplate(v,vars)]));
  return value;
}

/** ترميز form بأقواس متداخلة كما تطلبه Stripe: line_items[0][price_data][currency]=kwd. */
export function formEncode(value:unknown,prefix=''):string{
  const parts:string[]=[];
  const walk=(v:unknown,key:string)=>{
    if(v===undefined||v===null)return;
    if(Array.isArray(v)){v.forEach((x,i)=>walk(x,`${key}[${i}]`));return}
    if(typeof v==='object'){for(const [k,x] of Object.entries(v as Record<string,unknown>))walk(x,key?`${key}[${k}]`:k);return}
    if(v==='')return; /* حقلٌ فارغ يُحذف: Stripe ترفض customer_email= فارغًا */
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  };
  walk(value,prefix);
  return parts.join('&');
}

const encodeBody=(body:unknown,encoding:'json'|'form'|undefined,headers:Record<string,string>)=>{
  if(body===undefined)return undefined;
  const has=(n:string)=>Object.keys(headers).some(k=>k.toLowerCase()===n);
  if(encoding==='form'){if(!has('content-type'))headers['content-type']='application/x-www-form-urlencoded';return formEncode(body)}
  if(!has('content-type'))headers['content-type']='application/json';
  return JSON.stringify(body);
};

const statusOf=(raw:string,paid?:string[],failed?:string[]):WebhookSettlement['status']=>{
  const v=raw.toLowerCase();
  const p=(paid||['paid','captured','success','succss','completed']).map(x=>x.toLowerCase());
  const f=(failed||['failed','declined','cancelled','canceled','expired','void']).map(x=>x.toLowerCase());
  return p.includes(v)?'paid':f.includes(v)?'failed':'pending';
};

const dateOf=(raw:string)=>{if(!raw)return undefined;const d=new Date(/^\d+$/.test(raw)?Number(raw):raw);return Number.isNaN(d.getTime())?undefined:d.toISOString()};

class ConfiguredGateway implements PaymentGateway{
  constructor(private profile:PaymentProviderProfile,private secrets:{apiKey:string;webhookSecret:string},public readonly name:string,private transport:GatewayTransport=defaultTransport){}

  private vars(input:CheckoutRequest):Record<string,string>{
    const minor=Math.max(0,Math.round(input.amountMinor));
    const iso=(()=>{try{return {major:platformMinorToMajorString(minor,input.currency),minor:String(platformMinorToIsoMinor(minor,input.currency))}}catch{return {major:'',minor:''}}})();
    return {
      apiKey:this.secrets.apiKey,
      amountMinor:String(minor),
      amountMajor:(minor/100).toFixed(2),
      /* بمنازل ISO للعملة: 5.250 د.ك، و5250 فلسًا — لبواباتٍ تتحقق من دقّة العملة. */
      amountIsoMajor:iso.major,
      amountIsoMinor:iso.minor,
      currency:input.currency,
      currencyLower:input.currency.toLowerCase(),
      invoiceId:input.invoiceId,
      invoiceNumber:input.invoiceNumber,
      description:input.description,
      callbackUrl:input.callbackUrl,
      errorUrl:input.errorUrl,
      webhookUrl:input.webhookUrl||'',
      customerName:input.customer?.name||'',
      customerEmail:input.customer?.email||'',
      customerPhone:input.customer?.phone||'',
    };
  }

  private async call(spec:{url:string;method?:string;headers?:Record<string,string>;body?:unknown;bodyEncoding?:'json'|'form'},vars:Record<string,string>){
    const url=String(renderTemplate(spec.url,vars));
    const headers=Object.fromEntries(Object.entries(renderTemplate(spec.headers||{},vars) as Record<string,unknown>).map(([k,v])=>[k,String(v)]));
    const body=encodeBody(spec.body===undefined?undefined:renderTemplate(spec.body,vars),spec.bodyEncoding,headers);
    const res=await this.transport(url,{method:(spec.method||(body===undefined?'GET':'POST')).toUpperCase(),headers,...(body===undefined?{}:{body})});
    let payload:unknown=undefined;
    try{payload=res.text?JSON.parse(res.text):undefined}catch{/* ردّ غير JSON: يُبلَّغ بالفشل أدناه */}
    return {status:res.status,payload};
  }

  async createCheckout(input:CheckoutRequest):Promise<CheckoutResult>{
    const c=this.profile.checkout;
    const {status,payload}=await this.call({...c,method:c.method||'POST',headers:c.headers||{'content-type':'application/json'}},this.vars(input));
    if(status<200||status>=300)throw new Error(`PAYMENT_GATEWAY_HTTP_${status}`);
    const paymentUrl=String(pathGet(payload,c.paymentUrlPath)??'');
    const externalRef=String(pathGet(payload,c.referencePath)??'');
    if(!paymentUrl||!externalRef)throw new Error('PAYMENT_GATEWAY_RESPONSE_INVALID');
    if(!/^https:\/\//i.test(paymentUrl))throw new Error('PAYMENT_GATEWAY_URL_NOT_HTTPS');
    return {paymentUrl,externalRef};
  }

  verifyWebhook(headers:Record<string,unknown>,rawBody:Buffer):WebhookSettlement|null{
    const w=this.profile.webhook;
    if(!w||!this.secrets.webhookSecret)return null;
    let payload:unknown;
    try{payload=JSON.parse(rawBody.toString('utf8'))}catch{return null}

    const flat=(key:string)=>{const v=pathGet(payload,key);return v===undefined||v===null?'':String(v)};
    const signed=w.signedPayload
      ? String(renderTemplate(w.signedPayload,new Proxy({},{get:(_t,p)=>flat(String(p))}) as unknown as Record<string,string>))
      : rawBody.toString('utf8');
    const expected=crypto.createHmac(w.algorithm||'sha256',this.secrets.webhookSecret).update(signed,'utf8').digest(w.encoding||'base64');
    if(!safeEqual(headerValue(headers,w.signatureHeader||'x-signature'),expected))return null;

    const externalRef=flat(w.referencePath);
    if(!externalRef)return null;
    const status=statusOf(String(w.statusPath?flat(w.statusPath):''),w.paidValues,w.failedValues);
    const amountMinor=w.amountPath?(w.amountIsMinor?(/^\d+$/.test(flat(w.amountPath))?Number(flat(w.amountPath)):null):majorStringToPlatformMinor(flat(w.amountPath))):null;
    return {
      externalRef,
      status,
      amountMinor:amountMinor??undefined,
      currency:w.currencyPath?flat(w.currencyPath).toUpperCase()||undefined:undefined,
      paidAt:w.paidAtPath?dateOf(flat(w.paidAtPath)):undefined,
      method:w.methodPath?flat(w.methodPath)||undefined:undefined,
    };
  }

  referenceFromNotification(rawBody:Buffer){
    const path=this.profile.notificationReferencePath||this.profile.webhook?.referencePath;
    if(!path)return null;
    try{const v=pathGet(JSON.parse(rawBody.toString('utf8')),path);const ref=v===undefined||v===null?'':String(v).trim();return ref&&ref.length<=200?ref:null}catch{return null}
  }

  get canQueryStatus(){return !!this.profile.statusQuery}

  async queryStatus(externalRef:string,currency:string):Promise<WebhookSettlement|null>{
    const q=this.profile.statusQuery;if(!q)return null;
    const ref=String(externalRef||'').trim();if(!ref||ref.length>200)return null;
    const {status,payload}=await this.call(q,{apiKey:this.secrets.apiKey,externalRef:ref,externalRefEncoded:encodeURIComponent(ref),currency,currencyLower:currency.toLowerCase()});
    if(status<200||status>=300)throw new Error(`PAYMENT_GATEWAY_HTTP_${status}`);
    const flat=(key:string)=>{const v=pathGet(payload,key);return v===undefined||v===null?'':String(v)};
    /* ردٌّ يخصّ عمليةً أخرى لا يُسوّي هذه. */
    if(q.referencePath&&flat(q.referencePath)!==ref)return null;
    const cur=(q.currencyPath?flat(q.currencyPath):'').toUpperCase()||undefined;
    let amountMinor:number|null=null;
    if(q.amountPath){const raw=flat(q.amountPath);amountMinor=q.amountUnit==='iso_minor'?isoMinorToPlatformMinor(raw,cur||currency):q.amountUnit==='platform_minor'?(/^\d+$/.test(raw)?Number(raw):null):majorStringToPlatformMinor(raw)}
    return {externalRef:ref,status:statusOf(flat(q.statusPath),q.paidValues,q.failedValues),amountMinor:amountMinor??undefined,currency:cur,paidAt:q.paidAtPath?dateOf(flat(q.paidAtPath)):undefined,method:q.methodPath?flat(q.methodPath)||undefined:undefined};
  }
}

/** أخطاء ملف البوابة كما يراها من يعدّها، قبل حفظه. */
export function validatePaymentProfile(profile:unknown):string[]{
  const p=profile as PaymentProviderProfile,errors:string[]=[];
  const https=(u:unknown)=>typeof u==='string'&&/^https:\/\/[^\s/$.?#][^\s]*$/i.test(u.replace(/\$\{[a-zA-Z0-9_.|]+\}/g,'x'));
  if(!p||typeof p!=='object')return ['PROFILE_REQUIRED'];
  if(!https(p.checkout?.url))errors.push('CHECKOUT_URL_MUST_BE_HTTPS');
  if(!p.checkout?.paymentUrlPath||!p.checkout?.referencePath)errors.push('CHECKOUT_RESPONSE_PATHS_REQUIRED');
  if(p.statusQuery){if(!https(p.statusQuery.url))errors.push('STATUS_QUERY_URL_MUST_BE_HTTPS');if(!p.statusQuery.statusPath)errors.push('STATUS_QUERY_STATUS_PATH_REQUIRED')}
  if(p.webhook&&!p.webhook.referencePath)errors.push('WEBHOOK_REFERENCE_PATH_REQUIRED');
  /* لا بدّ من طريقٍ موثوق لإثبات السداد: استعلامٌ بالمفتاح، أو إشعارٌ موقَّع. */
  if(!p.statusQuery&&!p.webhook)errors.push('SETTLEMENT_VERIFICATION_REQUIRED');
  if(JSON.stringify(p).length>20_000)errors.push('PROFILE_TOO_LARGE');
  return errors;
}

/**
 * بوابةٌ من ملفٍّ وأسرار — لبوابات الجهات والمشغّلين. الناقل يُحقن ليمرّ كل طلب عبر حارس
 * الشبكة الداخلية، لأن العنوان هنا يكتبه مستخدم لا بيئة التشغيل.
 */
export function buildPaymentGateway(profile:PaymentProviderProfile,secrets:{apiKey:string;webhookSecret?:string},name:string,transport:GatewayTransport):ConfiguredGateway{
  const errors=validatePaymentProfile(profile);if(errors.length)throw new Error(`PAYMENT_PROFILE_INVALID:${errors[0]}`);
  if(!String(secrets.apiKey||'').trim())throw new Error('PAYMENT_API_KEY_REQUIRED');
  if(profile.webhook&&!profile.statusQuery&&!String(secrets.webhookSecret||'').trim())throw new Error('PAYMENT_WEBHOOK_SECRET_REQUIRED');
  return new ConfiguredGateway(profile,{apiKey:String(secrets.apiKey).trim(),webhookSecret:String(secrets.webhookSecret||'').trim()},name,transport);
}

/**
 * يبني البوابة من البيئة. غياب الإعداد ليس خطأً: يعني التحصيل اليدوي كما هو،
 * فتبقى الفوترة تعمل كاملة ويظهر زر الدفع الإلكتروني فقط حين تكون البوابة مهيأة.
 */
export function paymentGatewayFromEnv(env:NodeJS.ProcessEnv=process.env):PaymentGateway|null{
  const raw=String(env.MIZAN_PAYMENT_CONFIG||'').trim();
  const apiKey=String(env.MIZAN_PAYMENT_API_KEY||'').trim();
  const webhookSecret=String(env.MIZAN_PAYMENT_WEBHOOK_SECRET||'').trim();
  if(!raw||!apiKey)return null;
  let profile:PaymentProviderProfile;
  try{profile=JSON.parse(raw)}catch{return null}
  if(!profile?.checkout?.url||!profile.checkout.paymentUrlPath||!profile.checkout.referencePath)return null;
  /* بوابة تقبض ولا تستطيع إثبات السداد أسوأ من غياب البوابة: يُدفع العميل ثم تبقى الفاتورة مفتوحة
     لأن كل إشعار سيُرفض. فلا تُعتبر مهيأة إلا باكتمال جانب الإشعار أيضًا. */
  if(!webhookSecret||!profile.webhook?.referencePath)return null;
  return new ConfiguredGateway(profile,{apiKey,webhookSecret},String(profile.name||env.MIZAN_PAYMENT_PROVIDER||'gateway').toLowerCase());
}

export const paymentProviderName=(env:NodeJS.ProcessEnv=process.env)=>String(env.MIZAN_PAYMENT_PROVIDER||'manual').trim().toLowerCase()||'manual';
