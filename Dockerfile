FROM node:20-slim

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src/ ./src/
COPY public/ ./public/

# Sem root: o processo não precisa de privilégio nenhum para servir HTTP e falar com Postgres/PocketBase.
RUN useradd --system --create-home --uid 10001 veiculos \
    && chown -R veiculos:veiculos /app
USER veiculos

EXPOSE 3000

# O Coolify tem healthcheck próprio; este cobre `docker run` avulso e o `docker compose` local.
# /saude não exige autenticação e não expõe dados — só confirma banco e PocketBase de pé.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "-e", "const p=process.env.PORT||3000; require('http').get('http://127.0.0.1:'+p+'/saude', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"]

CMD ["node", "src/server.js"]
