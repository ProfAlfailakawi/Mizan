# MIZAN — production image.
#
# The browser bundle is built here, so every VITE_* value must be present at BUILD time:
# Vite inlines them into the bundle and they are not readable from the container environment
# later. Server-side secrets (R2, Firebase Admin, signing keys) are the opposite — they stay
# out of the image and arrive at run time from Secret Manager.
#
# Firebase web config values are public client identifiers by design (they identify the project
# to Google's auth endpoints); access is controlled by Firebase security rules and authorized
# domains, not by hiding them. They are still passed as build args rather than committed.

FROM node:22-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY . .

# الافتراض إنتاجٌ آمن، لا عرضٌ تجريبي. سببه واقعة حقيقية: زناد نشرٍ يبني عبر Dockerfile
# مباشرة (لا عبر cloudbuild.yaml) لا تصله متغيّرات ذلك الملف، فكان يأخذ الافتراض القديم
# "false" فيُخرج وضع العرض على النطاقات الحيّة كلها. القيم أدناه علنية (معرّفات Firebase
# للويب، تحميها قيود النطاق لا الإخفاء، وهي مكرّرة في cloudbuild.yaml) فبَقاؤها هنا آمن،
# ويجعل أي بناءٍ — بأي طريقة — يُنتج نسخة إنتاج صحيحة. لبناء عرضٍ بلا مصادقة مرّر
# VITE_REQUIRE_AUTH=false صراحةً.
ARG VITE_FIREBASE_API_KEY="AIzaSyAU13efq58hCJirGDyu9dZf8lzRatbhwcY"
ARG VITE_FIREBASE_AUTH_DOMAIN="mizan-f2ce3.firebaseapp.com"
ARG VITE_FIREBASE_PROJECT_ID="mizan-f2ce3"
ARG VITE_FIREBASE_STORAGE_BUCKET="mizan-f2ce3.firebasestorage.app"
ARG VITE_FIREBASE_MESSAGING_SENDER_ID="993698501419"
ARG VITE_FIREBASE_APP_ID="1:993698501419:web:47a25e46ccbacccb17ab6e"
ARG VITE_REQUIRE_AUTH="true"
# موظفو الجهة يبقون على سياسة MFA الاختيارية الحالية.
ARG VITE_REQUIRE_MFA_FOR_SENSITIVE="false"
# مالك المنصة محمي افتراضيًا حتى لو بُنيت الصورة خارج cloudbuild.yaml.
ARG VITE_REQUIRE_MFA_FOR_SUPER_ADMIN="true"
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_REQUIRE_AUTH=$VITE_REQUIRE_AUTH \
    VITE_REQUIRE_MFA_FOR_SENSITIVE=$VITE_REQUIRE_MFA_FOR_SENSITIVE \
    VITE_REQUIRE_MFA_FOR_SUPER_ADMIN=$VITE_REQUIRE_MFA_FOR_SUPER_ADMIN

# Cloud Run injects the listening port through PORT. A fixed development port in server.ts caused
# production revisions to bind :3000 while Cloud Run probed :8080. Keep the production image
# fail-safe: rewrite only that exact legacy declaration before bundling; once source is dynamic,
# this becomes a no-op and still verifies the runtime contract.
# الفحص على العقد لا على نصٍّ بعينه. النسخة السابقة كانت تشترط صيغة حرفية واحدة، فانكسر
# البناء حين صار المصدر يقرأ PORT بصيغة أمتن منها — أي أن الحارس رفض إصلاحًا أفضل مما ينتظر.
RUN node -e "const fs=require('fs');const p='server.ts';let s=fs.readFileSync(p,'utf8');const legacy='const PORT = 3000;';if(s.includes(legacy)){s=s.replace(legacy,'const PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 3000;');fs.writeFileSync(p,s)}if(!/const PORT\s*=[^;]*process\.env\.PORT/.test(s))throw new Error('Cloud Run PORT contract missing: server.ts must read process.env.PORT');"

RUN npm run build

# Runtime image: production dependencies plus the built server bundle and static assets.
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist ./dist

EXPOSE 8080
CMD ["node", "dist/server.cjs"]
