# LAN instance of the console, run on the Pi by
# ../edge-gateway-docker/docker-compose.prod.yml.
#
# Built on the target machine so `prisma generate` picks the right engine for
# arm64 without listing binaryTargets in the schema.

FROM node:22-bookworm-slim AS base
# Prisma's query engine links against OpenSSL; slim images do not ship it.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so they
# must be known here, not only when the container starts. Changing any of them
# means rebuilding the image.
ARG NEXT_PUBLIC_MQTT_CONNECTION_URL
ARG NEXT_PUBLIC_DEPARTMENT_ID
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_MQTT_CONNECTION_URL=$NEXT_PUBLIC_MQTT_CONNECTION_URL \
    NEXT_PUBLIC_DEPARTMENT_ID=$NEXT_PUBLIC_DEPARTMENT_ID \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# File tracing does not always pick up the generated client's engine binary.
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma

USER node
EXPOSE 3000
CMD ["node", "server.js"]
