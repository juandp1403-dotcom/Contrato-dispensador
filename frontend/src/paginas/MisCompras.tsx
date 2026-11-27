import { Link } from "react-router";
import { Ventana } from "../App";
import { useCartera } from "../cartera";
import { corta, eth } from "../chain";
import { useEventos } from "../eventos";
import { FONDOS_COMPRADOR, useMaquina } from "../maquina";

export default function MisCompras() {
  const { productos, nombre } = useMaquina();
  const { activa, cuentas } = useCartera();
  const mias = useEventos().filter((e) => e.tipo === "CompraExitosa" && e.cuenta === activa);
  const gastado = mias.reduce((s, e) => s + e.monto, 0n);
  const saldo = cuentas.find((c) => c.direccion === activa)?.saldo ?? 0n;
  const prod = (d: string) => productos.find((p) => p.direccion === d);

  return (
    <div className="rejilla">
      <Ventana titulo={`CARTERA_${nombre(activa).replace(" ", "_").toUpperCase()}.DAT`} tip="Resumen de tu cartera y tus compras." className="col-ancha ventana-principal">
        <div className="fichas">
          <div className="ficha ficha-destacada" data-tip="Saldo actual de tu cartera en la red local." tabIndex={0}>
            <span className="ficha-titulo">SALDO</span>
            <span className="ficha-valor">{eth(saldo, 4)} ETH</span>
          </div>
          <div className="ficha" data-tip="Suma de montoPagado de tus eventos CompraExitosa." tabIndex={0}>
            <span className="ficha-titulo">GASTADO</span>
            <span className="ficha-valor">{eth(gastado, 4)} ETH</span>
          </div>
          <div className="ficha" data-tip="Cantidad de productos que compraste." tabIndex={0}>
            <span className="ficha-titulo">COMPRAS</span>
            <span className="ficha-valor">{mias.length}</span>
          </div>
          <div className="ficha" data-tip="Saldo inicial asignado al encender la máquina (o al recargar). Como el gas es gratis, saldo + gastado = fondos iniciales." tabIndex={0}>
            <span className="ficha-titulo">FONDOS INICIALES</span>
            <span className="ficha-valor">{eth(FONDOS_COMPRADOR)} ETH</span>
          </div>
        </div>
      </Ventana>

      <Ventana titulo="MIS_TICKETS.PRN" tip="Cada ticket sale de un evento CompraExitosa emitido por el contrato del producto." className="col-ancha">
        {mias.length === 0 ? (
          <p className="vacio">
            &gt; TODAVÍA NO HAS COMPRADO NADA_ <Link to="/maquina" className="enlace-pixel">IR A LA MÁQUINA</Link>
          </p>
        ) : (
          <div className="tickets">
            {mias.map((e) => {
              const p = prod(e.producto);
              return (
                <div key={`${e.hash}-${e.orden}`} className="ticket" data-tip={`Contrato del producto ${e.producto} · tx ${e.hash}`}>
                  <p className="ticket-titulo">
                    <span style={{ color: p?.color === "#ffffff" ? undefined : p?.color }}>{p?.icono}</span> {p?.nombre ?? corta(e.producto)}
                  </p>
                  <p>VENTA ……. #{e.idVenta?.toString()}</p>
                  <p>PAGADO …… {eth(e.monto, 6)} ETH</p>
                  <p>BLOQUE …… #{e.bloque}</p>
                  <p>TX ……….. {corta(e.hash)}</p>
                </div>
              );
            })}
          </div>
        )}
      </Ventana>
    </div>
  );
}
