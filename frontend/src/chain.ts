import {
  ContractFactory,
  Interface,
  JsonRpcProvider,
  JsonRpcSigner,
  Network,
  formatEther,
  toQuantity,
  type InterfaceAbi,
} from "ethers";

/**
 * Conexión al nodo Hardhat (sin MetaMask). El nodo vive en la red interna de
 * Docker y el navegador lo alcanza por el proxy "/rpc" del propio servidor
 * (mismo dominio, sin CORS). El nodo expone cuentas de prueba desbloqueadas:
 * la "cartera local" le pide al nodo que firme con la cuenta elegida.
 */
export const RPC_URL = new URL(import.meta.env.VITE_RPC_URL ?? "/rpc", window.location.origin).href;
export const CHAIN_ID = BigInt(import.meta.env.VITE_CHAIN_ID ?? "31337");

let provider: JsonRpcProvider | undefined;

export function getProvider(): JsonRpcProvider {
  // staticNetwork evita que ethers reintente en bucle si el nodo está apagado.
  provider ??= new JsonRpcProvider(RPC_URL, undefined, {
    staticNetwork: Network.from(CHAIN_ID),
    polling: true,
    pollingInterval: 1000,
    cacheTimeout: -1,
  });
  return provider;
}

export async function verificarNodo(): Promise<void> {
  const chainId = BigInt(await getProvider().send("eth_chainId", []));
  if (chainId !== CHAIN_ID) {
    throw new Error(`El nodo es la red ${chainId}, pero se esperaba ${CHAIN_ID}.`);
  }
}

/** Cuentas desbloqueadas del nodo Hardhat (la cartera local). */
export async function listarCuentas(): Promise<string[]> {
  const cuentas = (await getProvider().send("eth_accounts", [])) as string[];
  return cuentas.map((c) => c.toLowerCase());
}

/**
 * Firmante "sin gas": en la red local de la máquina el base fee es 0, así que
 * enviamos cada transacción con comisión 0. De este modo los saldos solo cambian
 * por compras, cobros y comisiones (las carteras del Admin y el Vendedor pueden
 * empezar en 0 ETH y aun así firmar).
 */
class SignerSinGas extends JsonRpcSigner {
  override sendUncheckedTransaction(tx: Parameters<JsonRpcSigner["sendUncheckedTransaction"]>[0]) {
    return super.sendUncheckedTransaction({ ...tx, maxFeePerGas: 0n, maxPriorityFeePerGas: 0n });
  }
}

export async function getSigner(cuenta: string): Promise<JsonRpcSigner> {
  return new SignerSinGas(getProvider(), cuenta);
}

/** La red está "encendida" para la máquina cuando el base fee del último bloque es 0. */
export async function redEncendida(): Promise<boolean> {
  const bloque = await getProvider().getBlock("latest");
  return bloque?.baseFeePerGas === 0n;
}

/** Fija el saldo de una cuenta en el nodo Hardhat (solo existe en redes locales). */
export async function fijarSaldo(cuenta: string, wei: bigint): Promise<void> {
  await getProvider().send("hardhat_setBalance", [cuenta, toQuantity(wei)]);
}

/**
 * Prepara la red local para la máquina: gas gratis, carteras de Admin y Vendedor
 * en 0 y compradores con muchos fondos. Mina un bloque para que el cambio quede activo.
 */
export async function prepararRed(vacias: string[], compradores: string[], fondos: bigint): Promise<void> {
  const p = getProvider();
  await p.send("hardhat_setNextBlockBaseFeePerGas", ["0x0"]);
  for (const c of vacias) await fijarSaldo(c, 0n);
  for (const c of compradores) await fijarSaldo(c, fondos);
  await p.send("evm_mine", []);
}

export async function hayCodigo(direccion: string): Promise<boolean> {
  if (!esDireccion(direccion)) return false;
  return (await getProvider().getCode(direccion)) !== "0x";
}

export async function desplegar(
  abi: InterfaceAbi,
  bytecode: string,
  signer: JsonRpcSigner,
  ...args: unknown[]
): Promise<string> {
  const fabrica = new ContractFactory(abi, bytecode, signer);
  const contrato = await fabrica.deploy(...args);
  await contrato.waitForDeployment();
  return (await contrato.getAddress()).toLowerCase();
}

export function esDireccion(texto: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(texto);
}

export function corta(direccion: string): string {
  return `${direccion.slice(0, 6)}…${direccion.slice(-4)}`;
}

/** Formatea wei como ETH con máximo `decimales` decimales. */
export function eth(wei: bigint, decimales = 4): string {
  const [entero, frac = ""] = formatEther(wei).split(".");
  const recorte = frac.slice(0, decimales).replace(/0+$/, "");
  return recorte ? `${entero}.${recorte}` : entero;
}

/** Busca dentro del error de ethers los datos crudos de la reversión (selector + argumentos). */
function buscarDatosRevert(valor: unknown, profundidad = 0): string | undefined {
  if (!valor || typeof valor !== "object" || profundidad > 6) return undefined;
  const obj = valor as Record<string, unknown>;
  if (typeof obj.data === "string" && /^0x[0-9a-fA-F]{8,}$/.test(obj.data)) return obj.data;
  for (const clave of ["error", "info", "data", "cause", "payload"]) {
    const encontrado = buscarDatosRevert(obj[clave], profundidad + 1);
    if (encontrado) return encontrado;
  }
  return undefined;
}

export type ErrorContrato = { nombre: string; args: unknown[] };

/** Decodifica un error personalizado de Solidity (p. ej. `PagoInsuficiente(enviado, requerido)`). */
export function decodificarError(error: unknown, iface: Interface): ErrorContrato | undefined {
  const e = error as { revert?: { name: string; args: unknown[] } };
  if (e?.revert?.name) return { nombre: e.revert.name, args: [...e.revert.args] };
  const datos = buscarDatosRevert(error);
  if (!datos) return undefined;
  try {
    const p = iface.parseError(datos);
    if (p) return { nombre: p.name, args: [...p.args] };
  } catch {
    /* selector desconocido */
  }
  return undefined;
}

export function errorDeConexion(error: unknown): string | undefined {
  const e = error as { shortMessage?: string; message?: string; code?: string };
  const texto = `${e?.code ?? ""} ${e?.shortMessage ?? ""} ${e?.message ?? ""}`;
  if (/Failed to fetch|ECONNREFUSED|NetworkError|fetch failed|SERVER_ERROR|TIMEOUT/i.test(texto)) {
    return "No se pudo conectar con el nodo blockchain. Revisa que el servicio «blockchain» esté en ejecución.";
  }
  return undefined;
}

/** Texto completo del error (incluye bigint) para buscar mensajes del nodo. */
function volcado(error: unknown): string {
  try {
    return JSON.stringify(error, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) ?? "";
  } catch {
    return String((error as Error)?.message ?? error);
  }
}

export function mensajeGenerico(error: unknown): string {
  const conexion = errorDeConexion(error);
  if (conexion) return conexion;
  const e = error as { shortMessage?: string; message?: string; code?: string };
  if (e?.code === "ACTION_REJECTED") return "Operación cancelada.";
  if (e?.code === "INSUFFICIENT_FUNDS" || /enough funds|insufficient funds/i.test(volcado(error))) {
    return "Fondos insuficientes: la cartera no tiene ETH suficiente para esta operación.";
  }
  if (/max fee per gas less than block base fee/i.test(volcado(error))) {
    return "La red no está preparada para la máquina. Pulsa «Encender máquina» en la Terminal.";
  }
  const texto = e?.shortMessage ?? e?.message ?? "La operación falló";
  return texto.length > 200 ? `${texto.slice(0, 200)}…` : texto;
}
