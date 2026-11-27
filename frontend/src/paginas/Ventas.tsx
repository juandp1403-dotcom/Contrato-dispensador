import { useMemo, useState } from "react";
import { Ventana } from "../App";
import { useCartera } from "../cartera";
import { corta, eth } from "../chain";
import { useEventos } from "../eventos";
import { useMaquina } from "../maquina";

type Filtro = "todos" | "CompraExitosa" | "FondosRetirados";

export default function Ventas() {
  const { productos, nombre, roles, rolActivo, cobros, config } = useMaquina();
  const { cuentas } = useCartera();
  const eventos = useEventos();
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const saldo = (d?: string) => cuentas.find((c) => c.direccion === d)?.saldo ?? 0n;
  const existentes = new Set(productos.map((p) => p.direccion));
  const misCobros = cobros.filter((c) => existentes.has(c.producto));

  const r = useMemo(() => {
    const compras = eventos.filter((e) => e.tipo === "CompraExitosa");
    const ingresos = compras.reduce((s, e) => s + e.monto, 0n);
    const cobrado = eventos.filter((e) => e.tipo === "FondosRetirados").reduce((s, e) => s + e.monto, 0n);
    const porProducto = new Map<string, bigint>();
    const porComprador = new Map<string, { n: number; total: bigint }>();
    for (const e of compras) {
      porProducto.set(e.producto, (porProducto.get(e.producto) ?? 0n) + e.monto);
      const x = porComprador.get(e.cuenta) ?? { n: 0, total: 0n };
      porComprador.set(e.cuenta, { n: x.n + 1, total: x.total + e.monto });
    }
    return {
      ventas: compras.length,
      ingresos,
      cobrado,
      porProducto,
      ranking: [...porComprador.entries()].sort((a, b) => b[1].n - a[1].n),
    };
  }, [eventos]);

  const enCajas = productos.reduce((s, p) => s + p.caja, 0n);
  const comisiones = misCobros.reduce((s, c) => s + BigInt(c.comision), 0n);
  const visibles = eventos.filter((e) => filtro === "todos" || e.tipo === filtro);
  const prod = (d: string) => productos.find((p) => p.direccion === d);

  return (
    <div className="rejilla">
      <Ventana titulo="REPORTE_VENTAS.DAT" tip="Datos leídos de la cadena: eventos y balances de todos los contratos-producto." className="col-ancha ventana-principal">
        {rolActivo === "vendedor" && (
          <p className="nota-alerta" data-tip="El vendedor no tiene botones de edición: solo consulta.">👁 SOLO LECTURA — puedes revisar todo, pero no modificar nada.</p>
        )}
        <div className="fichas">
          <Ficha t="INGRESOS" v={`${eth(r.ingresos, 4)} ETH`} tip="Suma de montoPagado de todos los eventos CompraExitosa, en todos los productos." destacado />
          <Ficha t="VENTAS" v={String(r.ventas)} tip="Cantidad total de compras exitosas." />
          <Ficha t="POR COBRAR" v={`${eth(enCajas, 4)} ETH`} tip="Suma de los balances de los contratos-producto: dinero vendido que el Admin aún no ha cobrado." />
          <Ficha t="COBRADO" v={`${eth(r.cobrado, 4)} ETH`} tip="Suma de los eventos FondosRetirados: lo que el Admin ya pasó de las cajas a su cartera." />
          <Ficha t="CARTERA ADMIN" v={`${eth(saldo(roles?.admin), 4)} ETH`} tip="Saldo actual del Admin. Empezó en 0: es lo cobrado menos las comisiones pagadas." destacado />
          <Ficha t="CARTERA VENDEDOR" v={`${eth(saldo(roles?.vendedor), 4)} ETH`} tip={`Saldo actual del Vendedor. Empezó en 0: son las comisiones (${config.comision}% de cada cobro).`} destacado />
        </div>
      </Ventana>

      <Ventana titulo="PRODUCTOS.TBL" tip="Un renglón por contrato DispensadorDigital. Los archivados conservan su historial." className="col-ancha">
        {productos.length === 0 ? (
          <p className="vacio">&gt; SIN PRODUCTOS_</p>
        ) : (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th data-tip="Código en la vitrina, ícono y nombre (guardados en la app).">PRODUCTO</th>
                  <th data-tip="activo: en vitrina · oculto: fuera de vitrina · archivado: reemplazado por otro contrato al cambiar el precio.">ESTADO</th>
                  <th data-tip="precioArticulo() del contrato (immutable).">PRECIO</th>
                  <th data-tip="totalVentas() del contrato.">VENDIDOS</th>
                  <th data-tip="Suma de CompraExitosa de este contrato.">INGRESOS</th>
                  <th data-tip="obtenerBalance(): lo que queda en la caja por cobrar.">CAJA</th>
                  <th data-tip="Dirección del contrato del producto.">CONTRATO</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => (
                  <tr key={p.direccion}>
                    <td>
                      <span style={{ color: p.color }}>{p.icono}</span> {p.codigo !== "—" ? `${p.codigo} ` : ""}
                      {p.nombre}
                    </td>
                    <td><span className={`estado-prod estado-${p.estado}`}>{p.estado.toUpperCase()}</span></td>
                    <td>{eth(p.precio)} ETH</td>
                    <td>{p.ventas.toString()}</td>
                    <td>{eth(r.porProducto.get(p.direccion) ?? 0n, 4)} ETH</td>
                    <td>{eth(p.caja, 4)} ETH</td>
                    <td data-tip={p.direccion}>{corta(p.direccion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Ventana>

      <Ventana titulo="COBROS_Y_COMISIONES.LOG" tip="Cada cobro: retirarGanancias() al Admin + transferencia de la comisión al Vendedor.">
        <p className="dato" data-tip="Total transferido al vendedor en comisiones.">
          COMISIONES PAGADAS ▸ <strong>{eth(comisiones, 6)} ETH</strong>
        </p>
        {misCobros.length === 0 ? (
          <p className="vacio">&gt; SIN COBROS TODAVÍA_</p>
        ) : (
          <ul className="lista-cobros">
            {misCobros.map((c) => {
              const p = prod(c.producto);
              const total = BigInt(c.cobrado);
              const com = BigInt(c.comision);
              return (
                <li key={`${c.hash}-${c.bloque}`} data-tip={`Bloque #${c.bloque} · tx ${c.hash}`}>
                  <span>{p?.icono} {p?.nombre}</span>
                  <span>{eth(total, 6)} ETH</span>
                  <span className="cobro-reparto">ADMIN {eth(total - com, 6)} · VEND {eth(com, 6)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Ventana>

      <Ventana titulo="TOP_COMPRADORES.DAT" tip="Ranking construido sumando los eventos CompraExitosa por comprador.">
        {r.ranking.length === 0 ? (
          <p className="vacio">&gt; SIN COMPRAS_</p>
        ) : (
          <ul className="ranking">
            {r.ranking.map(([cuenta, d], i) => (
              <li key={cuenta} data-tip={`${cuenta}: ${d.n} compras por ${eth(d.total, 6)} ETH`}>
                <span className="ranking-pos">{String(i + 1).padStart(2, "0")}</span>
                <span className="ranking-nombre">{nombre(cuenta)}</span>
                <span className="ranking-barra" style={{ width: `${(d.n / r.ranking[0][1].n) * 100}%` }} />
                <span className="ranking-n">{d.n}×</span>
              </li>
            ))}
          </ul>
        )}
      </Ventana>

      <Ventana titulo="BITACORA.LOG" tip="Eventos de todos los contratos-producto, del más reciente al más antiguo." className="col-ancha">
        <div className="chips">
          {(["todos", "CompraExitosa", "FondosRetirados"] as Filtro[]).map((f) => (
            <button
              key={f}
              className={`chip${filtro === f ? " chip-activo" : ""}`}
              onClick={() => setFiltro(f)}
              data-tip={f === "todos" ? "Mostrar todos los eventos." : `Mostrar solo eventos ${f}.`}
            >
              {f === "todos" ? "TODOS" : f}
            </button>
          ))}
        </div>
        {visibles.length === 0 ? (
          <p className="vacio">&gt; SIN EVENTOS TODAVÍA_</p>
        ) : (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th data-tip="Bloque donde se minó la transacción.">BLOQUE</th>
                  <th data-tip="Evento emitido.">EVENTO</th>
                  <th data-tip="Contrato-producto que emitió el evento.">PRODUCTO</th>
                  <th data-tip="Comprador o dueño (argumento indexado).">CUENTA</th>
                  <th data-tip="montoPagado o montoRetirado.">MONTO</th>
                  <th data-tip="idVenta: contador propio de cada producto.">VENTA</th>
                  <th data-tip="Hash de la transacción.">TX</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((e) => {
                  const p = prod(e.producto);
                  return (
                    <tr key={`${e.hash}-${e.orden}`} className={e.tipo === "FondosRetirados" ? "fila-retiro" : ""}>
                      <td>#{e.bloque}</td>
                      <td>{e.tipo === "CompraExitosa" ? "▣ CompraExitosa" : "◈ FondosRetirados"}</td>
                      <td data-tip={e.producto}>{p ? `${p.icono} ${p.nombre}` : corta(e.producto)}</td>
                      <td data-tip={e.cuenta}>{nombre(e.cuenta)}</td>
                      <td>{eth(e.monto, 6)} ETH</td>
                      <td>{e.idVenta !== undefined ? `#${e.idVenta}` : "—"}</td>
                      <td data-tip={e.hash}>{corta(e.hash)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Ventana>
    </div>
  );
}

function Ficha({ t, v, tip, destacado }: { t: string; v: string; tip: string; destacado?: boolean }) {
  return (
    <div className={`ficha${destacado ? " ficha-destacada" : ""}`} data-tip={tip} tabIndex={0}>
      <span className="ficha-titulo">{t}</span>
      <span className="ficha-valor">{v}</span>
    </div>
  );
}
