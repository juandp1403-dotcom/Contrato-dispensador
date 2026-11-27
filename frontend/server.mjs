// Servidor de producción de la máquina dispensadora (sin dependencias).
//  - Sirve el build de Vite (dist/) con fallback SPA.
//  - /rpc  → proxy JSON-RPC hacia el nodo Hardhat (red interna de Docker) con lista de métodos permitidos.
//  - /api  → estado compartido de la máquina (catálogo, configuración y cobros) persistido en DATA_DIR.
//  - /health → chequeo de salud para Docker / Coolify.
import { createServer } from "node:http";
import { readFile, writeFile, rename, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const RPC_UPSTREAM = process.env.RPC_UPSTREAM ?? "http://127.0.0.1:8545";
const DATA_DIR = process.env.DATA_DIR ?? join(RAIZ, "data");
const DIST = join(RAIZ, "dist");
const ARCHIVO = join(DATA_DIR, "estado.json");
const MAX_BODY = 1024 * 1024;

// ---------------------------------------------------------------- RPC
// Solo se reenvían los métodos que usa la app. Quedan bloqueados, entre otros,
// hardhat_reset, hardhat_setCode, hardhat_impersonateAccount y evm_revert.
const PERMITIDOS_EXTRA = new Set(["hardhat_setBalance", "hardhat_setNextBlockBaseFeePerGas", "evm_mine"]);
const permitido = (m) => typeof m === "string" && (/^(eth|net|web3)_/.test(m) || PERMITIDOS_EXTRA.has(m));

async function proxyRpc(cuerpo, res) {
  let datos;
  try {
    datos = JSON.parse(cuerpo);
  } catch {
    return json(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } });
  }
  const lista = Array.isArray(datos) ? datos : [datos];
  const bloqueado = lista.find((p) => !permitido(p?.method));
  if (bloqueado) {
    const err = (p) => ({
      jsonrpc: "2.0",
      id: p?.id ?? null,
      error: permitido(p?.method)
        ? { code: -32600, message: `Lote rechazado: incluye el método no permitido ${bloqueado.method}` }
        : { code: -32601, message: `Método no permitido: ${p?.method}` },
    });
    return json(res, 200, Array.isArray(datos) ? lista.map(err) : err(bloqueado));
  }
  try {
    const r = await fetch(RPC_UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: cuerpo,
      signal: AbortSignal.timeout(30000),
    });
    res.writeHead(r.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(await r.text());
  } catch {
    json(res, 502, { jsonrpc: "2.0", id: null, error: { code: -32000, message: "El nodo blockchain no responde" } });
  }
}

// ---------------------------------------------------------------- estado compartido
const DIRECCION = /^0x[0-9a-f]{40}$/;
const ESTADOS = new Set(["activo", "oculto", "archivado"]);
const VACIO = () => ({ catalogo: [], config: { comision: 20, cobroAuto: true }, cobros: [] });
let estado = VACIO();
let cola = Promise.resolve();

async function cargar() {
  try {
    estado = { ...VACIO(), ...JSON.parse(await readFile(ARCHIVO, "utf8")) };
  } catch {
    estado = VACIO();
  }
}

/** Serializa las escrituras y guarda de forma atómica (archivo temporal + rename). */
function mutar(fn) {
  const tarea = cola.then(async () => {
    fn(estado);
    await mkdir(DATA_DIR, { recursive: true });
    const tmp = `${ARCHIVO}.tmp`;
    await writeFile(tmp, JSON.stringify(estado, null, 1));
    await rename(tmp, ARCHIVO);
    return estado;
  });
  cola = tarea.catch(() => undefined);
  return tarea;
}

const texto = (v, max) => String(v ?? "").trim().slice(0, max);
function producto(p) {
  const direccion = texto(p?.direccion, 42).toLowerCase();
  if (!DIRECCION.test(direccion)) throw new Error("Dirección de contrato inválida");
  const nombre = texto(p?.nombre, 14).toUpperCase();
  if (!nombre) throw new Error("El nombre es obligatorio");
  return {
    direccion,
    nombre,
    icono: texto(p?.icono, 4) || "◉",
    color: /^#[0-9a-f]{6}$/i.test(p?.color) ? p.color : "#ffe600",
    estado: ESTADOS.has(p?.estado) ? p.estado : "activo",
  };
}

async function api(metodo, ruta, cuerpo, res) {
  const b = cuerpo ? JSON.parse(cuerpo) : {};
  const partes = ruta.split("/").filter(Boolean); // ["api", ...]

  if (metodo === "GET" && ruta === "/api/estado") return json(res, 200, estado);

  if (metodo === "POST" && ruta === "/api/productos") {
    const p = producto(b);
    return json(res, 200, await mutar((e) => {
      if (!e.catalogo.some((x) => x.direccion === p.direccion)) e.catalogo.push(p);
    }));
  }

  if (partes[1] === "productos" && partes[2]) {
    const dir = partes[2].toLowerCase();
    if (!DIRECCION.test(dir)) throw new Error("Dirección inválida");

    if (metodo === "PATCH" && partes.length === 3) {
      return json(res, 200, await mutar((e) => {
        e.catalogo = e.catalogo.map((x) => (x.direccion === dir ? producto({ ...x, ...b, direccion: dir }) : x));
      }));
    }
    // Cambio de precio: el nuevo contrato ocupa el lugar del anterior, que queda archivado.
    if (metodo === "POST" && partes[3] === "reemplazar") {
      const nuevo = producto(b);
      return json(res, 200, await mutar((e) => {
        e.catalogo = e.catalogo.flatMap((x) => (x.direccion === dir ? [nuevo, { ...x, estado: "archivado" }] : [x]));
      }));
    }
  }

  if (metodo === "PUT" && ruta === "/api/config") {
    const comision = Math.min(100, Math.max(0, Number(b.comision) || 0));
    return json(res, 200, await mutar((e) => {
      e.config = { comision, cobroAuto: Boolean(b.cobroAuto) };
    }));
  }

  if (metodo === "POST" && ruta === "/api/cobros") {
    const cobro = {
      producto: texto(b.producto, 42).toLowerCase(),
      cobrado: /^\d+$/.test(String(b.cobrado)) ? String(b.cobrado) : "0",
      comision: /^\d+$/.test(String(b.comision)) ? String(b.comision) : "0",
      hash: texto(b.hash, 66),
      bloque: Number(b.bloque) || 0,
    };
    return json(res, 200, await mutar((e) => {
      e.cobros = [cobro, ...e.cobros].slice(0, 1000);
    }));
  }

  if (metodo === "POST" && ruta === "/api/reiniciar") {
    return json(res, 200, await mutar((e) => {
      e.catalogo = [];
      e.cobros = [];
    }));
  }

  json(res, 404, { error: "Ruta de API no encontrada" });
}

// ---------------------------------------------------------------- estáticos
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function estatico(ruta, res) {
  const segura = normalize(decodeURIComponent(ruta)).replace(/^([/\\])+/, "").replace(/^(\.\.[/\\])+/, "");
  let archivo = join(DIST, segura);
  if (!archivo.startsWith(DIST)) archivo = join(DIST, "index.html");
  try {
    if (!(await stat(archivo)).isFile()) throw new Error();
  } catch {
    archivo = join(DIST, "index.html"); // fallback SPA (react-router)
  }
  const tipo = MIME[extname(archivo)] ?? "application/octet-stream";
  const cache = archivo.includes(`${join(DIST, "assets")}`) ? "public, max-age=31536000, immutable" : "no-cache";
  res.writeHead(200, { "Content-Type": tipo, "Cache-Control": cache });
  res.end(await readFile(archivo));
}

// ---------------------------------------------------------------- utilidades
function json(res, codigo, datos) {
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(datos));
}

function leerCuerpo(req) {
  return new Promise((ok, mal) => {
    let tam = 0;
    const trozos = [];
    req.on("data", (c) => {
      tam += c.length;
      if (tam > MAX_BODY) {
        mal(new Error("Cuerpo demasiado grande"));
        req.destroy();
      } else trozos.push(c);
    });
    req.on("end", () => ok(Buffer.concat(trozos).toString("utf8")));
    req.on("error", mal);
  });
}

async function nodoVivo() {
  try {
    const r = await fetch(RPC_UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: AbortSignal.timeout(3000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- servidor
await cargar();
if (!existsSync(join(DIST, "index.html"))) console.warn("⚠ No existe dist/index.html: ejecuta `npm run build` primero.");

const servidor = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  try {
    if (pathname === "/health") return json(res, 200, { ok: true, nodo: await nodoVivo() });
    if (pathname === "/rpc") {
      if (req.method !== "POST") return json(res, 405, { error: "Usa POST" });
      return await proxyRpc(await leerCuerpo(req), res);
    }
    if (pathname.startsWith("/api/")) return await api(req.method, pathname, req.method === "GET" ? "" : await leerCuerpo(req), res);
    if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "Método no permitido" });
    return await estatico(pathname, res);
  } catch (e) {
    if (!res.headersSent) json(res, 400, { error: e instanceof Error ? e.message : "Solicitud inválida" });
  }
});

servidor.listen(PORT, "0.0.0.0", () => {
  console.log(`Máquina dispensadora en http://0.0.0.0:${PORT}  ·  RPC → ${RPC_UPSTREAM}  ·  datos en ${DATA_DIR}`);
});

for (const senal of ["SIGTERM", "SIGINT"]) {
  process.on(senal, () => servidor.close(() => process.exit(0)));
}
