FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json ./
RUN npm install --omit=dev && npm install prisma@^5.15.0

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY themes ./themes

ENV NODE_ENV=production
ENV THEMES_DIR=/app/themes
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
