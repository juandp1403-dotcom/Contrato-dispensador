import { useEffect, useState } from "react";
import type { EventLog } from "ethers";
import { useCartera } from "./cartera";
import { useMaquina } from "./maquina";

export type Evento = {
  tipo: "CompraExitosa" | "FondosRetirados";
  producto: string;
  cuenta: string;
  monto: bigint;
  idVenta?: bigint;
  bloque: number;
  hash: string;
  orden: number;
};

/** Lee CompraExitosa y FondosRetirados de TODOS los contratos-producto (incluye archivados). */
export function useEventos(): Evento[] {
  const { productos, contrato } = useMaquina();
  const { bloque } = useCartera();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const direcciones = productos.map((p) => p.direccion).join(",");

  useEffect(() => {
    let vigente = true;
    const lista = direcciones ? direcciones.split(",") : [];
    Promise.all(
      lista.map(async (dir) => {
        const c = contrato(dir);
        const [compras, retiros] = await Promise.all([
          c.queryFilter(c.filters.CompraExitosa(), 0),
          c.queryFilter(c.filters.FondosRetirados(), 0),
        ]);
        const base = (e: EventLog) => ({ producto: dir, bloque: e.blockNumber, hash: e.transactionHash, orden: e.blockNumber * 1000 + e.index });
        return [
          ...(compras as EventLog[]).map<Evento>((e) => ({
            tipo: "CompraExitosa",
            cuenta: String(e.args[0]).toLowerCase(),
            monto: e.args[1] as bigint,
            idVenta: e.args[2] as bigint,
            ...base(e),
          })),
          ...(retiros as EventLog[]).map<Evento>((e) => ({
            tipo: "FondosRetirados",
            cuenta: String(e.args[0]).toLowerCase(),
            monto: e.args[1] as bigint,
            ...base(e),
          })),
        ];
      }),
    )
      .then((r) => vigente && setEventos(r.flat().sort((a, b) => b.orden - a.orden)))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [direcciones, bloque, contrato]);

  return eventos;
}
