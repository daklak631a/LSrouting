# Ảnh gọn, chạy bằng người dùng không phải root.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY config ./config

# Cloud Run truyền cổng qua biến PORT.
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "src/server.js"]
