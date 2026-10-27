FROM node:22.22.0-bookworm-slim AS server-build
WORKDIR /workspace/server
COPY server/package*.json ./
RUN npm ci --no-audit --no-fund
COPY server/ ./
RUN npm run build && npm test

FROM node:22.22.0-bookworm-slim AS server
ENV NODE_ENV=production
WORKDIR /workspace/server
COPY server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=server-build /workspace/server/dist ./dist
USER node
EXPOSE 8000
CMD ["node", "dist/index.js"]

FROM node:22.22.0-bookworm-slim AS client-build
WORKDIR /workspace/client
COPY client/package*.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
COPY server/models/ /workspace/server/models/
RUN npm run lint && npm run build

FROM nginx:1.26.3 AS client
COPY --from=client-build /workspace/client/dist /usr/share/nginx/html
COPY infra/playground/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
