FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY src ./src
COPY scripts ./scripts
COPY test ./test
COPY tsconfig.json ./tsconfig.json
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3030

EXPOSE 3030

CMD ["node", "dist/src/http/server.js"]
