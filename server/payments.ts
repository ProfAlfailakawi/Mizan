import crypto from 'crypto';

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
}
export interface CheckoutResult{paymentUrl:string;externalRef:string}
/** نتيجة إشعار البوابة بعد نجاح التحقق من توقيعه. */
export interface WebhookSettlement{externalRef:string;status:'paid'|'failed'|'pending';amountMinor?:number;currency?:string;paidAt?:string;method?:string}

export interface PaymentGateway{
  readonly name:string;
  createCheckout(input:CheckoutRequest):Promise<CheckoutResult>;
  /** null تعني فشل التحقق من التوقيع، ويُرفض الإشعار حينها. */
  verifyWebhook(headers:Record<string,unknown>,rawBody:Buffer):WebhookSettlement|null;
}

/** وصف البوابة كما يأتي من الإعداد. كل الحقول اختيارية عدا ما يلزم لإتمام العملية. */
export interface PaymentProviderProfile{
  name?:string;
  checkout:{
    url:string;
    method?:string;
    headers?:Record<string,string>;
    body?:unknown;
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
    const whole=/^\$\{([a-zA-Z0-9_]+)\}$/.exec(value.trim());
    if(whole)return vars[whole[1]]??'';
    return value.replace(/\$\{([a-zA-Z0-9_]+)\}/g,(_m,k)=>vars[k]??'');
  }
  if(Array.isArray(value))return value.map(v=>renderTemplate(v,vars));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([k,v])=>[k,renderTemplate(v,vars)]));
  return value;
}

class ConfiguredGateway implements PaymentGateway{
  constructor(private profile:PaymentProviderProfile,private secrets:{apiKey:string;webhookSecret:string},public readonly name:string){}

  private vars(input:CheckoutRequest):Record<string,string>{
    const minor=Math.max(0,Math.round(input.amountMinor));
    return {
      apiKey:this.secrets.apiKey,
      amountMinor:String(minor),
      amountMajor:(minor/100).toFixed(2),
      currency:input.currency,
      invoiceId:input.invoiceId,
      invoiceNumber:input.invoiceNumber,
      description:input.description,
      callbackUrl:input.callbackUrl,
      errorUrl:input.errorUrl,
      customerName:input.customer?.name||'',
      customerEmail:input.customer?.email||'',
      customerPhone:input.customer?.phone||'',
    };
  }

  async createCheckout(input:CheckoutRequest):Promise<CheckoutResult>{
    const vars=this.vars(input),c=this.profile.checkout;
    const url=String(renderTemplate(c.url,vars));
    const headers=Object.fromEntries(Object.entries(renderTemplate(c.headers||{'content-type':'application/json'},vars) as Record<string,unknown>).map(([k,v])=>[k,String(v)]));
    if(!headers['content-type']&&!headers['Content-Type'])headers['content-type']='application/json';
    const res=await fetch(url,{method:c.method||'POST',headers,body:c.body===undefined?undefined:JSON.stringify(renderTemplate(c.body,vars))});
    const text=await res.text();
    let payload:unknown=undefined;
    try{payload=text?JSON.parse(text):undefined}catch{/* ردّ غير JSON: تُترك القيمة غير معرّفة ويُبلَّغ بالفشل أدناه */}
    if(!res.ok)throw new Error(`PAYMENT_GATEWAY_HTTP_${res.status}`);
    const paymentUrl=String(pathGet(payload,c.paymentUrlPath)??'');
    const externalRef=String(pathGet(payload,c.referencePath)??'');
    if(!paymentUrl||!externalRef)throw new Error('PAYMENT_GATEWAY_RESPONSE_INVALID');
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
    const raw=String(w.statusPath?flat(w.statusPath):'').toLowerCase();
    const paidValues=(w.paidValues||['paid','captured','success','succss','completed']).map(x=>x.toLowerCase());
    const failedValues=(w.failedValues||['failed','declined','cancelled','canceled']).map(x=>x.toLowerCase());
    const status:WebhookSettlement['status']=paidValues.includes(raw)?'paid':failedValues.includes(raw)?'failed':'pending';

    const amountRaw=w.amountPath?Number(flat(w.amountPath)):NaN;
    const amountMinor=Number.isFinite(amountRaw)?(w.amountIsMinor?Math.round(amountRaw):Math.round(amountRaw*100)):undefined;
    const paidAtRaw=w.paidAtPath?flat(w.paidAtPath):'';
    const parsedDate=paidAtRaw?new Date(/^\d+$/.test(paidAtRaw)?Number(paidAtRaw):paidAtRaw):undefined;
    return {
      externalRef,
      status,
      amountMinor,
      currency:w.currencyPath?flat(w.currencyPath)||undefined:undefined,
      paidAt:parsedDate&&!Number.isNaN(parsedDate.getTime())?parsedDate.toISOString():undefined,
      method:w.methodPath?flat(w.methodPath)||undefined:undefined,
    };
  }
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
  return new ConfiguredGateway(profile,{apiKey,webhookSecret},String(profile.name||env.MIZAN_PAYMENT_PROVIDER||'gateway').toLowerCase());
}

export const paymentProviderName=(env:NodeJS.ProcessEnv=process.env)=>String(env.MIZAN_PAYMENT_PROVIDER||'manual').trim().toLowerCase()||'manual';
