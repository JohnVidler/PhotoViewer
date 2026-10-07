# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm install

FROM deps AS build
COPY . .
RUN npm run build

FROM node:20-alpine AS prod-deps
WORKDIR /app/server
COPY server/package.json ./
RUN npm install --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PHOTOS_DIR=/data/photos \
    CACHE_DIR=/data/cache \
    PORT=3000

RUN addgroup -S photoviewer && adduser -S photoviewer -G photoviewer \
  && mkdir -p /data/photos /data/cache \
  && chown -R photoviewer:photoviewer /data

COPY --from=prod-deps /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
COPY server/package.json ./server/package.json

USER photoviewer
EXPOSE 3000
VOLUME ["/data/photos", "/data/cache"]

CMD ["node", "server/dist/index.js"]
