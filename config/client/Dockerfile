FROM node@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS build
WORKDIR /build
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client/index.html client/tsconfig.json client/vite.config.ts ./
COPY client/src ./src
COPY client/public ./public
RUN npm run build

FROM node@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f
ENV NODE_ENV=production PORT=3080
WORKDIR /app
COPY --from=build --chown=node:node /build/dist ./dist
COPY --chown=node:node client/server/production.mjs ./server/production.mjs
USER node
CMD ["node", "server/production.mjs"]
