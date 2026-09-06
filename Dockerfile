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

ARG VITE_FIREBASE_API_KEY=""
ARG VITE_FIREBASE_AUTH_DOMAIN=""
ARG VITE_FIREBASE_PROJECT_ID=""
ARG VITE_FIREBASE_STORAGE_BUCKET=""
ARG VITE_FIREBASE_MESSAGING_SENDER_ID=""
ARG VITE_FIREBASE_APP_ID=""
ARG VITE_REQUIRE_AUTH="false"
ARG VITE_REQUIRE_MFA_FOR_SENSITIVE="true"
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_REQUIRE_AUTH=$VITE_REQUIRE_AUTH \
    VITE_REQUIRE_MFA_FOR_SENSITIVE=$VITE_REQUIRE_MFA_FOR_SENSITIVE

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
