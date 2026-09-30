import type { PaymentProviderProfile } from './payments';

/*
 * قوالب بدءٍ لبوابات شائعة — لا «تكاملات جاهزة مضمونة».
 *
 * كل قالب مبنيّ على الوثائق العامة للبوابة كما هي معروفة وقت كتابته، ولم يُجرَّب هنا على
 * حساب حقيقي. لذلك يُعرض للجهة بوسم «يلزم اختباره في بيئة الاختبار»، ولا تُفعَّل البوابة
 * للتحصيل الحقيقي إلا بعد أن تجتاز عملية اختبار كاملة (verifiedAt) بمفاتيح الجهة نفسها.
 *
 * السداد لا يُثبَت بإشعارٍ غير موقَّع أبدًا: يُستعلَم عنه من البوابة بالمفتاح السرّي
 * (statusQuery)، والإشعار الوارد يوقظ الاستعلام فقط.
 */

export interface PaymentPreset {
  id: string;
  label: string;
  labelArabic: string;
  docsUrl: string;
  /** ما يجب على الجهة التحقق منه قبل التشغيل الحقيقي. */
  notes: string[];
  notesArabic: string[];
  profile: PaymentProviderProfile;
}

const myFatoorah = (host: string): PaymentProviderProfile => ({
  name: 'myfatoorah',
  checkout: {
    url: `https://${host}/v2/SendPayment`,
    headers: { authorization: 'Bearer ${apiKey}', 'content-type': 'application/json' },
    body: {
      NotificationOption: 'LNK',
      CustomerName: '${customerName}',
      InvoiceValue: '${amountIsoMajor|number}',
      DisplayCurrencyIso: '${currency}',
      CallBackUrl: '${callbackUrl}',
      ErrorUrl: '${errorUrl}',
      Language: 'ar',
      CustomerReference: '${invoiceId}',
    },
    paymentUrlPath: 'Data.InvoiceURL',
    referencePath: 'Data.InvoiceId',
  },
  statusQuery: {
    url: `https://${host}/v2/GetPaymentStatus`,
    method: 'POST',
    headers: { authorization: 'Bearer ${apiKey}', 'content-type': 'application/json' },
    body: { Key: '${externalRef}', KeyType: 'InvoiceId' },
    statusPath: 'Data.InvoiceStatus',
    referencePath: 'Data.InvoiceId',
    amountPath: 'Data.InvoiceValue',
    amountUnit: 'major',
    currencyPath: 'Data.InvoiceTransactions.0.Currency',
    paidValues: ['Paid'],
    failedValues: ['Canceled', 'Expired'],
  },
  notificationReferencePath: 'Data.InvoiceId',
});

export const PAYMENT_PRESETS: PaymentPreset[] = [
  {
    id: 'myfatoorah_test',
    label: 'MyFatoorah (test environment)',
    labelArabic: 'ماي فاتورة (بيئة الاختبار)',
    docsUrl: 'https://docs.myfatoorah.com/',
    notes: [
      'Uses the test host apitest.myfatoorah.com with a test API token.',
      'InvoiceValue is compared in the account currency; keep the fee currency equal to the MyFatoorah account currency.',
      'The currency is read from the first transaction (Data.InvoiceTransactions[0].Currency); the activation test fails if your account returns it elsewhere — adjust currencyPath then.',
    ],
    notesArabic: [
      'يستخدم خادم الاختبار apitest.myfatoorah.com برمز اختبار.',
      'تُقارن قيمة الفاتورة بعملة الحساب، فاجعل عملة الرسوم مطابقة لعملة حساب ماي فاتورة.',
      'تُقرأ العملة من أول عملية (Data.InvoiceTransactions[0].Currency)؛ ويفشل اختبار التفعيل إن أعادها حسابكم في موضع آخر، فعدّل currencyPath حينها.',
    ],
    profile: myFatoorah('apitest.myfatoorah.com'),
  },
  {
    id: 'myfatoorah_live',
    label: 'MyFatoorah (live — Kuwait, UAE, Bahrain, Jordan, Oman)',
    labelArabic: 'ماي فاتورة (حقيقي — الكويت والإمارات والبحرين والأردن وعُمان)',
    docsUrl: 'https://docs.myfatoorah.com/',
    notes: [
      'Saudi Arabia, Qatar and Egypt accounts use a different host (api-sa, api-qa, api-eg); edit the two URLs accordingly.',
      'Configure the MyFatoorah webhook to the URL shown after saving; notifications only trigger a server-side status check.',
    ],
    notesArabic: [
      'حسابات السعودية وقطر ومصر تستخدم خادمًا مختلفًا (api-sa وapi-qa وapi-eg)، فعدّل العنوانين.',
      'اضبط إشعار ماي فاتورة على العنوان الظاهر بعد الحفظ؛ الإشعار يطلق استعلامًا من الخادم فقط.',
    ],
    profile: myFatoorah('api.myfatoorah.com'),
  },
  {
    id: 'tap',
    label: 'Tap Payments',
    labelArabic: 'تاب للمدفوعات',
    docsUrl: 'https://developers.tap.company/',
    notes: [
      'Test and live use the same host; the secret key (sk_test_… or sk_live_…) selects the mode.',
      'The participant email is sent as the customer contact.',
    ],
    notesArabic: [
      'الاختبار والحقيقي على الخادم نفسه، والمفتاح السرّي (sk_test_ أو sk_live_) يحدد الوضع.',
      'يُرسل بريد المتسابق بصفته وسيلة التواصل للعميل.',
    ],
    profile: {
      name: 'tap',
      checkout: {
        url: 'https://api.tap.company/v2/charges',
        headers: { authorization: 'Bearer ${apiKey}', 'content-type': 'application/json' },
        body: {
          amount: '${amountIsoMajor|number}',
          currency: '${currency}',
          description: '${description}',
          customer: { first_name: '${customerName}', email: '${customerEmail}' },
          source: { id: 'src_all' },
          redirect: { url: '${callbackUrl}' },
          post: { url: '${webhookUrl}' },
          reference: { transaction: '${invoiceId}', order: '${invoiceId}' },
        },
        paymentUrlPath: 'transaction.url',
        referencePath: 'id',
      },
      statusQuery: {
        url: 'https://api.tap.company/v2/charges/${externalRefEncoded}',
        method: 'GET',
        headers: { authorization: 'Bearer ${apiKey}' },
        statusPath: 'status',
        referencePath: 'id',
        amountPath: 'amount',
        amountUnit: 'major',
        currencyPath: 'currency',
        paidValues: ['CAPTURED'],
        failedValues: ['FAILED', 'DECLINED', 'CANCELLED', 'ABANDONED', 'VOID', 'TIMEDOUT', 'RESTRICTED'],
      },
      notificationReferencePath: 'id',
    },
  },
  {
    id: 'stripe_checkout',
    label: 'Stripe Checkout',
    labelArabic: 'سترايب (صفحة الدفع)',
    docsUrl: 'https://docs.stripe.com/api/checkout/sessions',
    notes: [
      'Amounts are sent in ISO minor units (KWD in fils, ending in 0 as Stripe requires).',
      'Point a Stripe webhook for checkout.session.completed at the URL shown after saving.',
    ],
    notesArabic: [
      'تُرسل المبالغ بوحدة ISO الصغرى (الدينار بالفلس، وتنتهي بصفر كما تشترط سترايب).',
      'وجّه إشعار checkout.session.completed في سترايب إلى العنوان الظاهر بعد الحفظ.',
    ],
    profile: {
      name: 'stripe',
      checkout: {
        url: 'https://api.stripe.com/v1/checkout/sessions',
        headers: { authorization: 'Bearer ${apiKey}' },
        bodyEncoding: 'form',
        body: {
          mode: 'payment',
          success_url: '${callbackUrl}',
          cancel_url: '${errorUrl}',
          client_reference_id: '${invoiceId}',
          customer_email: '${customerEmail}',
          line_items: [{ quantity: '1', price_data: { currency: '${currencyLower}', unit_amount: '${amountIsoMinor}', product_data: { name: '${description}' } } }],
        },
        paymentUrlPath: 'url',
        referencePath: 'id',
      },
      statusQuery: {
        url: 'https://api.stripe.com/v1/checkout/sessions/${externalRefEncoded}',
        method: 'GET',
        headers: { authorization: 'Bearer ${apiKey}' },
        statusPath: 'payment_status',
        referencePath: 'id',
        amountPath: 'amount_total',
        amountUnit: 'iso_minor',
        currencyPath: 'currency',
        paidValues: ['paid'],
        failedValues: [],
      },
      notificationReferencePath: 'data.object.id',
    },
  },
];

export const presetById = (id: string) => PAYMENT_PRESETS.find(p => p.id === id);
