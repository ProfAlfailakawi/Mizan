#!/usr/bin/env node
import 'dotenv/config';
import { inspectProductionConfig, formatConfigReport } from '../server/production-config-guard';

/*
 * فحص إعدادات التشغيل قبل النشر — يُشغَّل يدويًا أو في CI.
 *
 * يطبع تقريرًا بلا كشف قيم الأسرار، ويعود بحالة خروجٍ غير صفرية عند وجود مانع،
 * ليوقف خطّ نشرٍ قبل أن يصل خادمٌ ناقصٌ إلى الإنتاج.
 *
 * الاستعمال:  npm run config:validate
 */

const result = inspectProductionConfig();
console.log(formatConfigReport(result));

if (!result.mayStart) {
  console.error(`\nPRODUCTION_CONFIG_INVALID: ${result.blockers.map(b => b.code).join(', ')}`);
  process.exit(1);
}
if (result.blockers.length) {
  // موانعُ لا تمنع الإقلاع هنا (بيئة غير إنتاجية) لكنها ستمنعه في الإنتاج.
  console.error(`\nتنبيه: ${result.blockers.length} مانعًا سيمنع الإقلاع في الإنتاج.`);
  process.exit(1);
}
