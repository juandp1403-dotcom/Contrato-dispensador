import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ContractTransactionReceipt, JsonRpcSigner } from "ethers";
import { errorDeConexion, getProvider, getSigner, listarCuentas, redEncendida, verificarNodo } from "./chain";

/**
 * Cartera local: lista las cuentas desbloqueadas del nodo, recuerda cuál está
 * "activa" (la que firma) y si la red ya fue preparada para la máquina.
 */
export type Cuenta = { direccion: string; indice: number; saldo: bigint };
export type Aviso = { id: number; tipo: "ok" | "error" | "info"; texto: string };
export type Resultado<T> = { ok: true; valor: T; recibo?: ContractTransactionReceipt | null } | { ok: false; error: unknown };

type OpcionesTx<T> = {
  exito?: string | ((valor: T, recibo?: ContractTransactionReceipt | null) => string);
  /** Firmar con otra cuenta distinta a la activa (p. ej. el oráculo). */
  como?: string;
  /** No mostrar el aviso de error (la página lo maneja). */
  silenciarError?: boolean;
  etiqueta?: string;
};

type Ctx = {
  conectado: boolean;
  errorNodo: string;
  bloque: number;
  cuentas: Cuenta[];
  activa: string;
  setActiva: (direccion: string) => void;
  /** true cuando la red local ya tiene gas gratis y las carteras preparadas. */
  encendida: boolean;
  avisos: Aviso[];
  avisar: (tipo: Aviso["tipo"], texto: string) => void;
  cerrarAviso: (id: number) => void;
  ocupado: string | null;
  refrescar: () => Promise<void>;
  ejecutar: <T>(accion: (signer: JsonRpcSigner) => Promise<T>, opciones?: OpcionesTx<T>) => Promise<Resultado<T>>;
};

const CarteraCtx = createContext<Ctx | null>(null);
const INTERVALO_MS = 2000;
const CUENTAS_USADAS = 5;

type Props = { prefijo: string; traducirError: (e: unknown) => string; children: ReactNode };

export function CarteraProvider({ prefijo, traducirError, children }: Props) {
  const [conectado, setConectado] = useState(false);
  const [errorNodo, setErrorNodo] = useState("");
  const [bloque, setBloque] = useState(-1);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [activa, setActivaState] = useState(() => localStorage.getItem(`${prefijo}:activa`) ?? "");
  const [encendida, setEncendida] = useState(false);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const activaRef = useRef(activa);
  activaRef.current = activa;
  const idAviso = useRef(0);

  const avisar = useCallback((tipo: Aviso["tipo"], texto: string) => {
    const id = ++idAviso.current;
    setAvisos((a) => [...a.slice(-3), { id, tipo, texto }]);
    window.setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === "error" ? 9000 : 5000);
  }, []);
  const cerrarAviso = useCallback((id: number) => setAvisos((a) => a.filter((x) => x.id !== id)), []);

  const setActiva = useCallback(
    (d: string) => {
      activaRef.current = d;
      setActivaState(d);
      localStorage.setItem(`${prefijo}:activa`, d);
    },
    [prefijo],
  );

  const refrescar = useCallback(async () => {
    try {
      await verificarNodo();
      const p = getProvider();
      const [todas, numero, encendidaAhora] = await Promise.all([listarCuentas(), p.getBlockNumber(), redEncendida()]);
      // La máquina usa las primeras cuentas (Admin, Vendedor y Compradores): solo esas se consultan.
      const lista = todas.slice(0, CUENTAS_USADAS);
      const saldos = await Promise.all(lista.map((d) => p.getBalance(d)));
      setCuentas(lista.map((d, i) => ({ direccion: d, indice: i, saldo: saldos[i] })));
      if (!lista.includes(activaRef.current) && lista.length) setActiva(lista[0]);
      setEncendida(encendidaAhora);
      setBloque(numero);
      setConectado(true);
      setErrorNodo("");
    } catch (e) {
      setConectado(false);
      setEncendida(false);
      setErrorNodo(errorDeConexion(e) ?? (e as Error)?.message ?? "Error de conexión");
    }
  }, [setActiva]);

  useEffect(() => {
    void refrescar();
    const t = window.setInterval(() => void refrescar(), INTERVALO_MS);
    return () => window.clearInterval(t);
  }, [refrescar]);

  const ejecutar = useCallback(
    async <T,>(accion: (signer: JsonRpcSigner) => Promise<T>, opciones: OpcionesTx<T> = {}): Promise<Resultado<T>> => {
      setOcupado(opciones.etiqueta ?? "tx");
      try {
        const signer = await getSigner(opciones.como ?? activaRef.current);
        const valor = await accion(signer);
        let recibo: ContractTransactionReceipt | null | undefined;
        const posibleTx = valor as { hash?: string; wait?: () => Promise<ContractTransactionReceipt | null> };
        if (posibleTx && typeof posibleTx.wait === "function") {
          recibo = await posibleTx.wait();
        }
        const { exito } = opciones;
        if (exito) avisar("ok", typeof exito === "function" ? exito(valor, recibo) : exito);
        await refrescar();
        return { ok: true, valor, recibo };
      } catch (error) {
        if (!opciones.silenciarError) avisar("error", traducirError(error));
        await refrescar();
        return { ok: false, error };
      } finally {
        setOcupado(null);
      }
    },
    [avisar, refrescar, traducirError],
  );

  return (
    <CarteraCtx.Provider
      value={{
        conectado,
        errorNodo,
        bloque,
        cuentas,
        activa,
        setActiva,
        encendida,
        avisos,
        avisar,
        cerrarAviso,
        ocupado,
        refrescar,
        ejecutar,
      }}
    >
      {children}
    </CarteraCtx.Provider>
  );
}

export function useCartera(): Ctx {
  const ctx = useContext(CarteraCtx);
  if (!ctx) throw new Error("useCartera debe usarse dentro de <CarteraProvider>");
  return ctx;
}
