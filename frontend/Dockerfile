# Frontend de la máquina dispensadora. Contexto de build: la RAÍZ del repositorio
# (necesita blockchain/ para compilar el contrato y exportar su ABI).

# 1) Compila el contrato y exporta ABI + bytecode
FROM node:24-alpine AS contrato
WORKDIR /app/blockchain
ENV HARDHAT_DISABLE_TELEMETRY_PROMPT=true
COPY blockchain/package.json blockchain/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY blockchain/hardhat.config.js ./
COPY blockchain/contracts ./contracts
COPY blockchain/scripts ./scripts
RUN npx hardhat compile && node scripts/exportar-abi.js /app/contratos.json

# 2) Build de React con Vite
FROM node:24-alpine AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
COPY --from=contrato /app/contratos.json ./src/contratos.json
# vite build directo (la verificación de tipos con tsc se hace en desarrollo: npm run build)
RUN npx vite build

# 3) Imagen final: solo Node + server.mjs + dist (sin node_modules)
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    RPC_UPSTREAM=http://blockchain:8545 \
    DATA_DIR=/data
COPY frontend/server.mjs ./
COPY --from=build /app/frontend/dist ./dist
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
