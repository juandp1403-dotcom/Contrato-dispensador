# Nodo blockchain: Hardhat con el contrato DispensadorDigital compilado y probado.
FROM node:24-alpine

WORKDIR /app
ENV HARDHAT_DISABLE_TELEMETRY_PROMPT=true \
    NODE_ENV=development

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY hardhat.config.js ./
COPY contracts ./contracts
COPY test ./test
COPY scripts ./scripts

# Compila con solc 0.8.34 (empaquetado en npm, sin descargas) y ejecuta las pruebas:
# si el contrato no compila o una prueba falla, el build se detiene aquí.
RUN npx hardhat compile && npx hardhat test

EXPOSE 8545

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8545',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "hardhat", "node", "--hostname", "0.0.0.0", "--port", "8545"]
