import { useState } from "react";
import { Link } from "react-router";
import { formatEther, parseEther } from "ethers";
import { Ventana } from "../App";
import { useCartera } from "../cartera";
import { corta, eth } from "../chain";
import { IFACE, useMaquina } from "../maquina";

type Ticket = { producto: string; icono: string; idVenta: bigint; pagado: bigint; comprador: string; hash: string; bloque: number };

export default function Comprar() {
  const { vitrina, comprar, nombre, rolActivo, config } = useMaquina();
  const { activa, ocupado, cuentas } = useCartera();
  const [seleccion, setSeleccion] = useState("");
  const [monto, setMonto] = useState("");
  const [ticket, setTicket] = useState<Ticket>();
  const [cayendo, setCayendo] = useState<string>();

  const producto = vitrina.find((p) => p.direccion === seleccion) ?? vitrina[0];
  const precio = producto?.precio ?? 0n;
  const saldo = cuentas.find((c) => c.direccion === activa)?.saldo ?? 0n;
  const puedeComprar = rolActivo === "comprador" || rolActivo === "admin";

  function elegir(direccion: string, p: bigint) {
    setSeleccion(direccion);
    setMonto(formatEther(p));
  }

  const textoMonto = monto || (producto ? formatEther(precio) : "");
  let wei: bigint | undefined;
  try {
    wei = parseEther(textoMonto || "0");
  } catch {
    wei = undefined;
  }
  const sinFondos = wei !== undefined && wei > saldo;
  const estadoPago =
    wei === undefined ? "invalido" : sinFondos ? "fondos" : wei < precio ? "corto" : wei === precio ? "exacto" : "sobra";

  const delta = precio / 5n > 0n ? precio / 5n : 1n;
  const presets = [
    { texto: "EXACTO", valor: precio, tip: "Envía exactamente el precio del producto. comprar() aceptará el pago." },
    { texto: "DE MÁS", valor: precio + delta, tip: "Envía más del precio. La compra pasa, pero el contrato NO devuelve el cambio: el excedente queda en la caja del producto." },
    { texto: "INSUFICIENTE", valor: precio - delta, tip: "Envía menos del precio para ver cómo el contrato revierte con PagoInsuficiente(enviado, requerido). No se cobra nada." },
  ];

  async function enviar() {
    if (!producto || wei === undefined) return;
    const recibo = await comprar(producto.direccion, wei);
    if (!recibo) return;
    for (const log of recibo.logs) {
      let p = null;
      try {
        p = IFACE.parseLog(log);
      } catch {
        p = null;
      }
      if (p?.name === "CompraExitosa") {
        setTicket({
          producto: producto.nombre,
          icono: producto.icono,
          comprador: String(p.args[0]).toLowerCase(),
          pagado: p.args[1] as bigint,
          idVenta: p.args[2] as bigint,
          hash: recibo.hash,
          bloque: recibo.blockNumber,
        });
        setCayendo(producto.icono);
        window.setTimeout(() => setCayendo(undefined), 1200);
      }
    }
  }

  return (
    <div className="rejilla rejilla-maquina">
      <div className="maquina" data-tip="La máquina dispensadora. Cada casilla es un producto y cada producto es un contrato DispensadorDigital distinto, con su propio precio fijo.">
        <div className="maquina-cabeza">
          <span className="cromo">DISPENSA</span>
          <span className="maquina-luces" aria-hidden><i /><i /><i /></span>
        </div>
        <div className="maquina-vitrina">
          {vitrina.length === 0 && (
            <p className="vitrina-vacia" data-tip="El Admin todavía no ha agregado productos.">
              VITRINA VACÍA
              {rolActivo === "admin" && <Link to="/admin" className="enlace-pixel">+ AGREGAR</Link>}
            </p>
          )}
          {vitrina.map((p) => (
            <button
              key={p.direccion}
              className={`producto${producto?.direccion === p.direccion ? " producto-activo" : ""}`}
              onClick={() => elegir(p.direccion, p.precio)}
              data-tip={`${p.nombre}: ${eth(p.precio)} ETH. Contrato ${p.direccion}. Vendidos: ${p.ventas}.`}
            >
              <span className="producto-icono" style={{ color: p.color }}>{p.icono}</span>
              <span className="producto-nombre">{p.nombre}</span>
              <span className="producto-precio">{eth(p.precio)} Ξ</span>
              <span className="producto-codigo">{p.codigo}</span>
            </button>
          ))}
        </div>
        <div className="maquina-panel">
          <div className="lcd" data-tip="Pantalla LCD: producto elegido, precio (precioArticulo) y ventas de ese contrato (totalVentas).">
            <span>{producto ? `${producto.codigo} ${producto.nombre}`.slice(0, 22) : "SIN PRODUCTO"}</span>
            <span>PRECIO {producto ? eth(precio) : "—"} ETH</span>
            <span>VENTAS {producto ? producto.ventas.toString().padStart(4, "0") : "0000"}</span>
          </div>
          <div className="ranura" data-tip="Ranura de monedas: aquí entra el msg.value de la transacción." aria-hidden>
            <span />
          </div>
        </div>
        <div className="bandeja" data-tip="Bandeja de salida: aparece tu producto cuando la compra se confirma en un bloque.">
          {cayendo && <span className="producto-cae">{cayendo}</span>}
          <span className="bandeja-texto">EMPUJE</span>
        </div>
      </div>

      <div className="columna">
        {!puedeComprar ? (
          <Ventana titulo="CONSULTA.EXE" tip="El vendedor tiene acceso de solo lectura." className="ventana-principal">
            <p className="pixel-grande" style={{ color: "#7a2bff" }}>👁 MODO CONSULTA</p>
            <p>Como Vendedor puedes ver la vitrina, pero no comprar ni editar. Cambia a un Comprador para comprar.</p>
            {producto && (
              <p className="dato" data-tip="Datos leídos del contrato del producto seleccionado.">
                {producto.icono} <strong>{producto.nombre}</strong> · {eth(producto.precio)} ETH · {producto.ventas.toString()} vendidos · caja {eth(producto.caja, 4)} ETH
              </p>
            )}
          </Ventana>
        ) : (
          <Ventana titulo="PAGO.EXE" tip="Configura cuánto ETH enviar en la transacción comprar() del producto elegido." className="ventana-principal">
            <p className="dato" data-tip="msg.sender: quien compra. Cámbialo en el selector de usuario de arriba.">
              COMPRADOR ▸ <strong>{nombre(activa)}</strong> · saldo {eth(saldo, 4)} ETH
            </p>
            {rolActivo === "admin" && (
              <p className="nota-alerta" data-tip="El Admin tiene acceso total, pero su cartera empezó en 0: solo puede comprar con lo que haya cobrado.">
                Compras como Admin con el dinero de tu cartera.
              </p>
            )}
            {producto ? (
              <>
                <p className="dato" data-tip={`Contrato del producto: ${producto.direccion}`}>
                  PRODUCTO ▸ <strong>{producto.icono} {producto.nombre}</strong> ({producto.codigo}) · {corta(producto.direccion)}
                </p>
                <label className="campo" data-tip="msg.value en ETH. Debe ser ≥ precio y no puede superar el saldo de tu cartera.">
                  <span>MONTO A INSERTAR (ETH)</span>
                  <input value={textoMonto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" />
                </label>
                <div className="chips">
                  {presets.map((p) => (
                    <button key={p.texto} className="chip" onClick={() => setMonto(formatEther(p.valor))} data-tip={p.tip}>
                      {p.texto}
                    </button>
                  ))}
                </div>
                <p className={`semaforo semaforo-${estadoPago}`} data-tip="Predicción local antes de enviar. La validación real la hace el contrato (y el nodo verifica tu saldo).">
                  {estadoPago === "invalido" && "✖ Monto no válido"}
                  {estadoPago === "fondos" && `✖ Tu cartera solo tiene ${eth(saldo, 4)} ETH: fondos insuficientes`}
                  {estadoPago === "corto" && `✖ Faltan ${eth(precio - (wei ?? 0n), 6)} ETH → revertirá con PagoInsuficiente`}
                  {estadoPago === "exacto" && "✔ Pago exacto → compra aceptada"}
                  {estadoPago === "sobra" && `▲ Sobran ${eth((wei ?? 0n) - precio, 6)} ETH → la máquina se los queda`}
                </p>
                <button
                  className="boton-cromo boton-grande"
                  onClick={() => void enviar()}
                  disabled={!!ocupado || wei === undefined || sinFondos}
                  data-tip={`Llama a comprar() del contrato de ${producto.nombre} con value = ${textoMonto || 0} ETH.${config.cobroAuto ? " Luego el cobro automático pasa el dinero al Admin y la comisión al Vendedor." : ""}`}
                >
                  {ocupado === "comprar" ? "PROCESANDO…" : ocupado === "cobrar" || ocupado === "comision" ? "COBRANDO…" : `▶ COMPRAR ${producto.nombre}`}
                </button>
              </>
            ) : (
              <p>No hay productos en la vitrina todavía.</p>
            )}
          </Ventana>
        )}

        {ticket && (
          <Ventana titulo="TICKET.PRN" tip="Recibo construido a partir del evento CompraExitosa(comprador, montoPagado, idVenta).">
            <div className="ticket">
              <p className="ticket-titulo">*** {ticket.icono} {ticket.producto} · VENTA #{ticket.idVenta.toString()} ***</p>
              <p data-tip="comprador (indexed): quién llamó a comprar().">COMPRADOR … {nombre(ticket.comprador)}</p>
              <p data-tip="montoPagado: msg.value completo, incluyendo lo que sobró.">PAGADO …… {eth(ticket.pagado, 6)} ETH</p>
              <p data-tip="idVenta es el contador del contrato de ESTE producto, por eso cada producto numera sus ventas por separado.">ID VENTA …. #{ticket.idVenta.toString()}</p>
              <p data-tip="Bloque en el que se minó la compra.">BLOQUE ……. #{ticket.bloque}</p>
              <p data-tip={`Hash de la transacción: ${ticket.hash}`}>TX ……….. {corta(ticket.hash)}</p>
              <p className="ticket-pie">GRACIAS POR SU COMPRA</p>
            </div>
          </Ventana>
        )}
      </div>
    </div>
  );
}
