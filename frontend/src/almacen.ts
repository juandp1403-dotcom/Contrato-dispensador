/**
 * Cliente de la API del servidor (/api): guarda el estado COMPARTIDO de la máquina
 * (catálogo, configuración y cobros) para que todos los navegadores vean lo mismo.
 * La blockchain guarda precios, ventas y dinero; aquí solo vive lo que el contrato
 * no almacena (nombre, ícono, color, visibilidad, % de comisión, historial de cobros).
 */
import type { Cobro, Config, Producto } from "./maquina";

export type EstadoCompartido = { catalogo: Producto[]; config: Config; cobros: Cobro[] };

async function llamar(metodo: string, ruta: string, cuerpo?: unknown): Promise<EstadoCompartido> {
  const r = await fetch(`/api${ruta}`, {
    method: metodo,
    headers: cuerpo === undefined ? undefined : { "Content-Type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    cache: "no-store",
  });
  const datos = (await r.json().catch(() => ({}))) as EstadoCompartido & { error?: string };
  if (!r.ok) throw new Error(datos.error ?? `Error del servidor (${r.status})`);
  return datos;
}

export const almacen = {
  leer: () => llamar("GET", "/estado"),
  agregar: (p: Producto) => llamar("POST", "/productos", p),
  editar: (direccion: string, cambios: Partial<Producto>) => llamar("PATCH", `/productos/${direccion}`, cambios),
  reemplazar: (direccion: string, nuevo: Producto) => llamar("POST", `/productos/${direccion}/reemplazar`, nuevo),
  config: (c: Config) => llamar("PUT", "/config", c),
  cobro: (c: Cobro) => llamar("POST", "/cobros", c),
  reiniciar: () => llamar("POST", "/reiniciar"),
};
