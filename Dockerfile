FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY drizzle ./drizzle
COPY .openai ./.openai
RUN node scripts/build.mjs
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "scripts/railway-server.mjs"]
