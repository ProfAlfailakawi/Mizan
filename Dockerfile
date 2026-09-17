# MIZAN — production image.
# Browser VITE_* values are inlined at build time. Server-side secrets remain runtime-only.

FROM node:22.20.0-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY . .

# Production-safe defaults. Firebase web config values are public client identifiers;
# production access remains governed by Firebase rules, claims, App Check / auth policy,
# and authorized domains. Build args may override these values in CI/CD.
ARG VITE_FIREBASE_API_KEY="AIzaSyAU13efq58hCJirGDyu9dZf8lzRatbhwcY"
ARG VITE_FIREBASE_AUTH_DOMAIN="mizan-f2ce3.firebaseapp.com"
ARG VITE_FIREBASE_PROJECT_ID="mizan-f2ce3"
ARG VITE_FIREBASE_STORAGE_BUCKET="mizan-f2ce3.firebasestorage.app"
ARG VITE_FIREBASE_MESSAGING_SENDER_ID="993698501419"
ARG VITE_FIREBASE_APP_ID="1:993698501419:web:47a25e46ccbacccb17ab6e"
ARG VITE_REQUIRE_AUTH="true"
ARG VITE_REQUIRE_MFA_FOR_SENSITIVE="false"
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

# Cloud Run injects PORT. Keep a fail-safe guard for legacy source snapshots.
RUN node -e "const fs=require('fs');const p='server.ts';let s=fs.readFileSync(p,'utf8');const legacy='const PORT = 3000;';if(s.includes(legacy)){s=s.replace(legacy,'const PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 3000;');fs.writeFileSync(p,s)}if(!/const PORT\\s*=[^;]*process\\.env\\.PORT/.test(s))throw new Error('Cloud Run PORT contract missing: server.ts must read process.env.PORT');"

# Production gate: secrets/source audit, production-runtime audit, lint, tests, and build.
RUN npm run check

FROM node:22.20.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080 NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist ./dist
# نصّ الروايات الاثنتي عشرة أثرٌ مثبَّت يُقرأ من القرص وقت التشغيل، لا يُجلب من شبكة.
# بدونه تفشل تلك الروايات مغلقةً باسمها — وهو فشلٌ صحيح، لكنه ليس ما نريد في الإنتاج.
COPY --from=build /app/quran-sources ./quran-sources

EXPOSE 8080
CMD ["node", "dist/server.cjs"]
