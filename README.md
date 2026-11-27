# Contrato-dispensador · DISPENSA-2000

Máquina dispensadora sobre blockchain: cada producto es un contrato `DispensadorDigital.sol`
desplegado por el Admin, los compradores pagan con ETH de práctica y las ventas llenan las carteras
del Admin y del Vendedor (por comisión). Frontend React con estética Y2K, sin MetaMask.

> Red de práctica: los fondos no tienen valor real. No uses esta configuración con dinero real.

## Arquitectura

```
Navegador ──HTTPS──► frontend (Node, puerto 3000) ──red interna──► blockchain (Hardhat, puerto 8545)
                      ├─ /         app React (build de Vite)
                      ├─ /rpc      proxy JSON-RPC con lista de métodos permitidos
                      ├─ /api      estado compartido: catálogo, comisión y cobros (volumen /data)
                      └─ /health   chequeo de salud
```

- **blockchain**: nodo Hardhat 2 (chainId 31337) con 20 cuentas de prueba desbloqueadas. No se publica:
  solo el frontend lo alcanza por la red interna de Docker.
- **frontend**: sirve la app y reenvía al nodo **solo** los métodos que usa la app (`eth_*`, `net_*`,
  `web3_*`, `hardhat_setBalance`, `hardhat_setNextBlockBaseFeePerGas`, `evm_mine`). Bloquea, entre otros,
  `hardhat_reset`, `hardhat_setCode` y `hardhat_impersonateAccount`.
- **Catálogo compartido**: el contrato solo guarda precio, ventas y dinero. El nombre, ícono, color y
  visibilidad de cada producto, la comisión y el historial de cobros se guardan en el servidor
  (`/data/estado.json`), así todos los navegadores ven la misma máquina.
- El contrato se compila con **solc 0.8.34** empaquetado en npm (sin descargas) y el build del frontend
  exporta su ABI y bytecode desde el `.sol`, así ambos quedan siempre sincronizados.

## Desplegar en Coolify

1. Sube este repositorio a GitHub (o conecta el repo existente).
2. En Coolify: **+ New Resource → Public/Private Repository** → elige el repo y la rama `main`.
3. **Build Pack: `Docker Compose`**, archivo `docker-compose.yml` (ruta base `/`).
4. En la pestaña del servicio **frontend**, asigna tu dominio (o usa el que genera
   `SERVICE_FQDN_FRONTEND_3000`). El tráfico se enruta al puerto **3000**. No asignes dominio al servicio
   `blockchain`.
5. **Deploy**. Coolify construye las dos imágenes; el build del nodo **compila el contrato y ejecuta sus
   pruebas** (si fallan, el despliegue se detiene antes de publicar nada).
6. Abre el dominio, pulsa **⏻ ENCENDER MÁQUINA** y sigue el recorrido de abajo.

No hace falta configurar variables de entorno: los valores por defecto ya funcionan.

| Variable (servicio frontend) | Valor por defecto | Para qué sirve |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |
| `RPC_UPSTREAM` | `http://blockchain:8545` | Dirección interna del nodo |
| `DATA_DIR` | `/data` | Carpeta del estado compartido (volumen `frontend-datos`) |

## Persistencia: qué se conserva y qué no

- **El nodo Hardhat guarda la cadena en memoria.** Si el contenedor `blockchain` se reinicia o haces un
  redeploy, la cadena vuelve a cero (sin contratos ni saldos). La app lo detecta sola: oculta los productos
  cuyos contratos ya no existen y muestra **ENCENDER MÁQUINA**; al encender, el catálogo se reinicia.
- **El volumen `frontend-datos`** conserva el catálogo, la comisión y los cobros entre reinicios del
  frontend.

## Probar en local

Con Docker:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
# http://localhost:3000
```

Sin Docker (Node 22+):

```bash
# Terminal 1: nodo blockchain
cd blockchain && npm install && npm run nodo

# Terminal 2: servidor de producción
cd frontend && npm install && npm run build && npm start
# http://localhost:3000
```

Para desarrollar con recarga en caliente, deja corriendo las dos terminales anteriores y en una tercera
ejecuta `cd frontend && npm run dev` (http://localhost:5174). Vite reenvía `/rpc` y `/api` al servidor del
puerto 3000.

Si modificas el contrato:

```bash
cd blockchain && npm test && npx hardhat compile && npm run exportar   # actualiza frontend/src/contratos.json
```

## Cómo se usa

Se elige el usuario en el selector **USUARIO** (arriba a la derecha). Cada visitante elige su rol en su
navegador. Pasa el cursor sobre cualquier elemento para ver su descripción.

| Usuario | Cuenta | Saldo inicial | Puede |
|---|---|---|---|
| Admin | 0 | 0 ETH | Todo: agregar/editar/ocultar productos, cambiar precio, cobrar, fijar comisión, recargar compradores, reiniciar |
| Vendedor | 1 | 0 ETH | Solo consultar ventas, cajas, cobros y la vitrina. Recibe la comisión |
| Compradores 1–3 | 2–4 | 10 000 ETH | Comprar con su saldo y ver sus tickets |

1. **Terminal (`/`)** → **ENCENDER MÁQUINA**: Admin y Vendedor quedan en 0 ETH, los compradores en
   10 000 ETH y el gas pasa a ser gratis (así los saldos solo cambian por ventas y comisiones).
2. **Admin (`/admin`)** → nombre, precio, ícono y color → **+ AGREGAR PRODUCTO** (despliega un contrato).
3. **Comprador → Máquina (`/maquina`)** → elige producto → **COMPRAR**. Con *cobro automático*, el Admin
   cobra al instante (`retirarGanancias()`) y la app transfiere el % de comisión al Vendedor.
4. **Vendedor → Ventas (`/ventas`)**: reporte de solo lectura.
5. **Admin**: comisión, cobro manual (**COBRAR TODO**), editar productos y **CAMBIAR PRECIO** (como el precio
   es `immutable`, se despliega un contrato nuevo y el anterior queda archivado).

## Estructura

```
├─ docker-compose.yml          despliegue (Coolify)
├─ docker-compose.local.yml    publica el puerto 3000 para pruebas locales con Docker
├─ blockchain/
│  ├─ contracts/DispensadorDigital.sol
│  ├─ test/                    pruebas del contrato (se ejecutan en el build)
│  ├─ scripts/exportar-abi.js  genera el ABI/bytecode para el frontend
│  ├─ hardhat.config.js        solc 0.8.34 local, EVM cancun, chainId 31337
│  └─ Dockerfile
└─ frontend/
   ├─ src/                     app React (roles, vitrina, ventas, panel admin)
   ├─ server.mjs               servidor de producción: estáticos + /rpc + /api + /health
   └─ Dockerfile               compila el contrato → build de Vite → imagen final con Node
```

## Seguridad (es una demo)

Cualquier visitante puede elegir el rol de Admin, porque así funciona la cartera local de la práctica.
El proxy RPC limita los métodos del nodo, pero la red y sus cuentas son de prueba. No reutilices estas
cuentas ni este nodo para fondos reales.
