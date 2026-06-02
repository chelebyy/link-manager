# link-manager frontend — VITE_API_KEY is build-time; must come in via ARG
# (Dokploy compose-mode injects secrets into runtime env, not into build args;
# we explicitly pass it through the build stage so Vite bakes it into the bundle)
FROM node:20-alpine AS builder
ARG VITE_API_KEY
ENV VITE_API_KEY=${VITE_API_KEY}
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1
