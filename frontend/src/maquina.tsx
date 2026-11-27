import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Contract,
  Interface,
  parseEther,
  type ContractRunner,
  type ContractTransactionReceipt,
  type ContractTransactionResponse,
  type InterfaceAbi,
} from "ethers";
import datos from "./contratos.json";
import { corta, decodificarError, desplegar, eth, getProvider, hayCodigo, mensajeGenerico, prepararRed, fijarSaldo } from "./chain";
import { useCartera } from "./cartera";
import { almacen, type EstadoCompartido } from "./almacen";

/**
 * La máquina dispensadora: cada PRODUCTO es su propio contrato DispensadorDigital
 * (precio immutable, dueño = Admin, contador y caja propios). El catálogo guarda
 * en el servidor (/api, compartido por todos los navegadores) los datos que el
 * contrato no tiene: nombre, ícono, color y visibilidad.
 */
export const ABI = datos.DispensadorDigital.abi as InterfaceAbi;
export const BYTECODE = datos.DispensadorDigital.bytecode;
export const IFACE = new Interface(ABI);

export const FONDOS_COMPRADOR = parseEther("10000");
export const NUM_COMPRADORES = 3;
export const ICONOS = ["◉", "◆", "★", "♦", "●", "▲", "■", "♥", "♣", "✚", "☻", "♫"];
export const COLORES = ["#ffe600", "#00f0ff", "#ff2bd6", "#b6ff00", "#ff8a00", "#ffffff"];

export type Rol = "admin" | "vendedor" | "comprador";
export type EstadoProducto = "activo" | "oculto" | "archivado";
export type Producto = { direccion: string; nombre: string; icono: string; color: string; estado: EstadoProducto };
export type ProductoVivo = Producto & { precio: bigint; ventas: bigint; caja: bigint; dueno: string; codigo: string };
export type Config = { comision: number; cobroAuto: boolean };
export type Cobro = { producto: string; cobrado: string; comision: string; hash: string; bloque: number };
export type NuevoProducto = { nombre: string; icono: string; color: string; precio: bigint };

const INTERVALO_ESTADO_MS = 2500;

export function traducirError(error: unknown): string {
  const dec = decodificarError(error, IFACE);
  if (dec) {
    const a = dec.args;
    switch (dec.nombre) {
      case "PagoInsuficiente":
        return `PagoInsuficiente: enviaste ${eth(a[0] as bigint)} ETH pero el producto cuesta ${eth(a[1] as bigint)} ETH.`;
      case "SoloDuenoPuedeRetirar":
        return `SoloDuenoPuedeRetirar: la cuenta ${corta(String(a[0]))} no es la dueña del producto.`;
      case "SinSaldoParaRetirar":
        return "SinSaldoParaRetirar: este producto no tiene ventas por cobrar.";
      case "FalloAlRetirar":
        return "FalloAlRetirar: la transferencia al dueño fue rechazada.";
      case "PrecioInvalido":
        return "PrecioInvalido: el precio del producto debe ser mayor que cero.";
      default:
        return `El contrato revirtió con ${dec.nombre}.`;
    }
  }
  return mensajeGenerico(error);
}

type Roles = { admin: string; vendedor: string; compradores: string[] };

type Ctx = {
  roles?: Roles;
  rol: (direccion: string) => Rol | undefined;
  rolActivo?: Rol;
  nombre: (direccion: string) => string;
  /** Todos los productos que existen en la cadena (incluye ocultos y archivados). */
  productos: ProductoVivo[];
  vitrina: ProductoVivo[];
  config: Config;
  setConfig: (c: Config) => void;
  cobros: Cobro[];
  contrato: (direccion: string, runner?: ContractRunner) => Contract;
  encender: () => Promise<void>;
  agregarProducto: (p: NuevoProducto) => Promise<boolean>;
  editarProducto: (direccion: string, cambios: Partial<Producto>) => void;
  cambiarPrecio: (direccion: string, precio: bigint) => Promise<boolean>;
  cobrar: (direccion: string, automatico?: boolean) => Promise<boolean>;
  cobrarTodo: () => Promise<void>;
  comprar: (direccion: string, valor: bigint) => Promise<ContractTransactionReceipt | null | undefined>;
  recargar: (comprador: string) => Promise<void>;
};

const MaquinaCtx = createContext<Ctx | null>(null);

export function MaquinaProvider({ children }: { children: ReactNode }) {
  const { cuentas, bloque, ejecutar, avisar, activa, setActiva, refrescar } = useCartera();
  const [catalogo, setCatalogo] = useState<Producto[]>([]);
  const [productos, setProductos] = useState<ProductoVivo[]>([]);
  const [config, setConfigState] = useState<Config>({ comision: 20, cobroAuto: true });
  const [cobros, setCobros] = useState<Cobro[]>([]);

  const configRef = useRef(config);
  configRef.current = config;

  const roles = useMemo<Roles | undefined>(
    () =>
      cuentas.length >= 2 + NUM_COMPRADORES
        ? {
            admin: cuentas[0].direccion,
            vendedor: cuentas[1].direccion,
            compradores: cuentas.slice(2, 2 + NUM_COMPRADORES).map((c) => c.direccion),
          }
        : undefined,
    [cuentas],
  );

  /** Aplica el estado compartido que devuelve el servidor. */
  const aplicar = useCallback((e: EstadoCompartido) => {
    setCatalogo((previo) => (JSON.stringify(previo) === JSON.stringify(e.catalogo) ? previo : e.catalogo));
    setConfigState((previo) => (previo.comision === e.config.comision && previo.cobroAuto === e.config.cobroAuto ? previo : e.config));
    setCobros((previo) => (JSON.stringify(previo) === JSON.stringify(e.cobros) ? previo : e.cobros));
  }, []);

  /** Ejecuta una operación sobre el estado compartido y avisa si el servidor falla. */
  const guardar = useCallback(
    async (op: () => Promise<EstadoCompartido>) => {
      try {
        aplicar(await op());
        return true;
      } catch (e) {
        avisar("error", `No se pudo guardar en el servidor: ${(e as Error).message}`);
        return false;
      }
    },
    [aplicar, avisar],
  );

  // Sincroniza el estado compartido (otros usuarios pueden cambiarlo desde otro navegador).
  useEffect(() => {
    let vigente = true;
    const sincronizar = () =>
      almacen
        .leer()
        .then((e) => vigente && aplicar(e))
        .catch(() => undefined);
    void sincronizar();
    const t = window.setInterval(sincronizar, INTERVALO_ESTADO_MS);
    return () => {
      vigente = false;
      window.clearInterval(t);
    };
  }, [aplicar]);

  const setConfig = useCallback(
    (c: Config) => {
      setConfigState(c);
      void guardar(() => almacen.config(c));
    },
    [guardar],
  );

  const contrato = useCallback(
    (direccion: string, runner: ContractRunner = getProvider()) => new Contract(direccion, ABI, runner),
    [],
  );

  // Lee de la cadena el estado de cada producto del catálogo en cada bloque nuevo.
  useEffect(() => {
    let vigente = true;
    (async () => {
      const p = getProvider();
      const vivos: ProductoVivo[] = [];
      let codigo = 0;
      for (const item of catalogo) {
        if (!(await hayCodigo(item.direccion))) continue; // el nodo se reinició
        const c = contrato(item.direccion);
        const [precio, ventas, caja, dueno] = await Promise.all([
          c.precioArticulo() as Promise<bigint>,
          c.totalVentas() as Promise<bigint>,
          p.getBalance(item.direccion),
          c.dueno() as Promise<string>,
        ]);
        const visible = item.estado === "activo";
        vivos.push({ ...item, precio, ventas, caja, dueno: dueno.toLowerCase(), codigo: visible ? `A${++codigo}` : "—" });
      }
      if (vigente) setProductos(vivos);
    })().catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [catalogo, bloque, contrato]);

  const rol = useCallback(
    (d: string): Rol | undefined => {
      if (!roles) return undefined;
      const dir = d.toLowerCase();
      if (dir === roles.admin) return "admin";
      if (dir === roles.vendedor) return "vendedor";
      if (roles.compradores.includes(dir)) return "comprador";
      return undefined;
    },
    [roles],
  );

  const nombre = useCallback(
    (d: string) => {
      const dir = d.toLowerCase();
      if (roles) {
        if (dir === roles.admin) return "Admin";
        if (dir === roles.vendedor) return "Vendedor";
        const i = roles.compradores.indexOf(dir);
        if (i >= 0) return `Comprador ${i + 1}`;
      }
      const prod = catalogo.find((p) => p.direccion === dir);
      if (prod) return `${prod.icono} ${prod.nombre}`;
      return corta(dir);
    },
    [roles, catalogo],
  );

  const rolActivo = rol(activa);

  async function encender() {
    if (!roles) return;
    const r = await ejecutar(() => prepararRed([roles.admin, roles.vendedor], roles.compradores, FONDOS_COMPRADOR), {
      etiqueta: "encender",
      exito: "Máquina encendida: Admin y Vendedor en 0 ETH, compradores con 10 000 ETH y gas gratis.",
    });
    if (r.ok) {
      await guardar(() => almacen.reiniciar());
      setActiva(roles.admin);
    }
  }

  async function agregarProducto(p: NuevoProducto) {
    if (!roles) return false;
    const r = await ejecutar((s) => desplegar(ABI, BYTECODE, s, p.precio), {
      como: roles.admin,
      etiqueta: "agregar",
      exito: (d) => `${p.icono} ${p.nombre} agregado: contrato ${corta(d)} con precio ${eth(p.precio)} ETH.`,
    });
    if (!r.ok) return false;
    return guardar(() => almacen.agregar({ direccion: r.valor, nombre: p.nombre, icono: p.icono, color: p.color, estado: "activo" }));
  }

  function editarProducto(direccion: string, cambios: Partial<Producto>) {
    // Actualización optimista: se ve al instante y luego se confirma con el servidor.
    setCatalogo((c) => c.map((p) => (p.direccion === direccion ? { ...p, ...cambios, direccion } : p)));
    void guardar(() => almacen.editar(direccion, cambios));
  }

  async function cambiarPrecio(direccion: string, precio: bigint) {
    const viejo = catalogo.find((p) => p.direccion === direccion);
    if (!viejo || !roles) return false;
    const r = await ejecutar((s) => desplegar(ABI, BYTECODE, s, precio), {
      como: roles.admin,
      etiqueta: "precio",
      exito: (d) => `${viejo.nombre} ahora cuesta ${eth(precio)} ETH (nuevo contrato ${corta(d)}). El anterior quedó archivado.`,
    });
    if (!r.ok) return false;
    // El servidor coloca el nuevo contrato en el lugar del anterior (conserva su código en la vitrina).
    return guardar(() =>
      almacen.reemplazar(direccion, { ...viejo, direccion: r.valor, estado: viejo.estado === "archivado" ? "activo" : viejo.estado }),
    );
  }

  /** Cobra la caja de un producto al Admin y transfiere la comisión al Vendedor. */
  async function cobrar(direccion: string, automatico = false) {
    if (!roles) return false;
    const prod = catalogo.find((p) => p.direccion === direccion);
    const r = await ejecutar((s) => contrato(direccion, s).retirarGanancias() as Promise<ContractTransactionResponse>, {
      como: roles.admin,
      etiqueta: "cobrar",
    });
    if (!r.ok) return false;
    // Monto realmente retirado, según el evento FondosRetirados(dueno, montoRetirado) del recibo.
    let caja = 0n;
    for (const log of r.recibo?.logs ?? []) {
      try {
        const ev = IFACE.parseLog(log);
        if (ev?.name === "FondosRetirados") caja = ev.args[1] as bigint;
      } catch {
        /* log de otro contrato */
      }
    }
    const pct = configRef.current.comision;
    const comision = (caja * BigInt(Math.round(pct * 100))) / 10000n;
    if (comision > 0n) {
      const r2 = await ejecutar((s) => s.sendTransaction({ to: roles.vendedor, value: comision }), {
        como: roles.admin,
        etiqueta: "comision",
      });
      if (!r2.ok) return false;
    }
    const nuevo: Cobro = {
      producto: direccion,
      cobrado: caja.toString(),
      comision: comision.toString(),
      hash: r.recibo?.hash ?? "",
      bloque: r.recibo?.blockNumber ?? 0,
    };
    setCobros((c) => [nuevo, ...c]);
    void guardar(() => almacen.cobro(nuevo));
    avisar(
      "ok",
      `${automatico ? "Cobro automático" : "Cobro"} de ${prod?.nombre ?? corta(direccion)}: Admin +${eth(caja - comision, 6)} ETH · Vendedor +${eth(comision, 6)} ETH (${pct}%).`,
    );
    return true;
  }

  async function cobrarTodo() {
    const conCaja = productos.filter((p) => p.caja > 0n);
    if (!conCaja.length) {
      avisar("info", "No hay ventas por cobrar en ningún producto.");
      return;
    }
    for (const p of conCaja) await cobrar(p.direccion);
  }

  async function comprar(direccion: string, valor: bigint) {
    const r = await ejecutar((s) => contrato(direccion, s).comprar({ value: valor }) as Promise<ContractTransactionResponse>, {
      etiqueta: "comprar",
    });
    if (!r.ok) return undefined;
    if (configRef.current.cobroAuto) await cobrar(direccion, true);
    return r.recibo;
  }

  async function recargar(comprador: string) {
    await ejecutar(() => fijarSaldo(comprador, FONDOS_COMPRADOR), {
      etiqueta: "recargar",
      exito: `${nombre(comprador)} recargado a 10 000 ETH.`,
    });
    await refrescar();
  }

  const vitrina = productos.filter((p) => p.estado === "activo");

  return (
    <MaquinaCtx.Provider
      value={{
        roles,
        rol,
        rolActivo,
        nombre,
        productos,
        vitrina,
        config,
        setConfig,
        cobros,
        contrato,
        encender,
        agregarProducto,
        editarProducto,
        cambiarPrecio,
        cobrar,
        cobrarTodo,
        comprar,
        recargar,
      }}
    >
      {children}
    </MaquinaCtx.Provider>
  );
}

export function useMaquina(): Ctx {
  const ctx = useContext(MaquinaCtx);
  if (!ctx) throw new Error("useMaquina debe usarse dentro de <MaquinaProvider>");
  return ctx;
}

export const ROL_TEXTO: Record<Rol, string> = { admin: "ADMIN", vendedor: "VENDEDOR", comprador: "COMPRADOR" };
export const ROL_DESCRIPCION: Record<Rol, string> = {
  admin: "Admin: acceso y edición total. Agrega productos (despliega un contrato por producto), edita el catálogo, cobra las ventas y fija la comisión del vendedor.",
  vendedor: "Vendedor: solo consulta. Ve las ventas, las cajas y el historial, pero no puede editar nada. Recibe una comisión por cada cobro.",
  comprador: "Comprador: solo puede comprar productos con el dinero de su cartera.",
};
