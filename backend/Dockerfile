# link-manager backend — invalidates build cache on 2026-06-02 deploy fix
# (LINK_MANAGER_API_KEY env now injected from Dokploy project-level secrets)
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache curl

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
RUN npm cache clean --force

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "dist/server.js"]
