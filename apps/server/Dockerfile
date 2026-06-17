FROM oven/bun:alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json bun.lock turbo.json tsconfig.json biome.jsonc ./
COPY apps ./apps
COPY packages ./packages
COPY sdks ./sdks

RUN bun install --frozen-lockfile
RUN bun run --filter server build

EXPOSE 3000

CMD ["bun", "/app/apps/server/dist/index.mjs"]
