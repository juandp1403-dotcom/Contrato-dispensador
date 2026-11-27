import { useState, type FormEvent } from "react";
import { parseEther } from "ethers";
import { Ventana } from "../App";
import { useCartera } from "../cartera";
import { corta, eth } from "../chain";
import { COLORES, ICONOS, useMaquina, type EstadoProducto, type ProductoVivo } from "../maquina";

export default function Admin() {
  const { productos } = useMaquina();
  const activos = productos.filter((p) => p.estado !== "archivado");
  const archivados = productos.filter((p) => p.estado === "archivado");

  return (
    <div className="rejilla">
      <NuevoProducto />
      <CajaYComision />
      <Ventana titulo="INVENTARIO.DB" tip="Catálogo de la máquina. Cada renglón es un contrato DispensadorDigital desplegado por el Admin." className="col-ancha">
        {activos.length === 0 ? (
          <p className="vacio">&gt; SIN PRODUCTOS_ Agrega el primero arriba.</p>
        ) : (
          <div className="inventario">
            {activos.map((p) => <Fila key={p.direccion} p={p} />)}
          </div>
        )}
        {archivados.length > 0 && (
          <>
            <p className="subtitulo-pixel" data-tip="Contratos reemplazados al cambiar el precio. Siguen existiendo en la cadena con su historial y su caja.">ARCHIVADOS</p>
            <div className="inventario">
              {archivados.map((p) => <Fila key={p.direccion} p={p} />)}
            </div>
          </>
        )}
      </Ventana>
      <Fondos />
      <Reiniciar />
    </div>
  );
}

function NuevoProducto() {
  const { agregarProducto } = useMaquina();
  const { ocupado, avisar } = useCartera();
  const [nombre, setNombre] = useState("");
  const [icono, setIcono] = useState(ICONOS[0]);
  const [color, setColor] = useState(COLORES[0]);
  const [precio, setPrecio] = useState("0.05");

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const n = nombre.trim().toUpperCase();
    if (!n) return avisar("error", "Escribe el nombre del producto.");
    let wei: bigint;
    try {
      wei = parseEther(precio || "0");
    } catch {
      return avisar("error", "Escribe un precio válido en ETH, por ejemplo 0.05");
    }
    if (await agregarProducto({ nombre: n.slice(0, 14), icono, color, precio: wei })) setNombre("");
  }

  return (
    <Ventana titulo="NUEVO_PRODUCTO.EXE" tip="Agregar un producto = desplegar un nuevo contrato DispensadorDigital con su precio. El Admin firma y queda como dueño." className="ventana-principal">
      <form onSubmit={enviar} className="formulario">
        <div className="nuevo-fila">
          <div className="vista-previa producto" data-tip="Vista previa de cómo se verá en la vitrina.">
            <span className="producto-icono" style={{ color }}>{icono}</span>
            <span className="producto-nombre">{nombre.trim().toUpperCase() || "NOMBRE"}</span>
            <span className="producto-precio">{precio || "0"} Ξ</span>
          </div>
          <div className="formulario">
            <label className="campo" data-tip="Nombre que aparece en la vitrina. Se guarda en la app (el contrato no guarda nombres). Máximo 14 caracteres.">
              <span>NOMBRE</span>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={14} placeholder="BIT-COLA" />
            </label>
            <label className="campo" data-tip="Argumento precioInicial del constructor, en ETH. Es immutable: para cambiarlo después se despliega otro contrato. Prueba con 0 para ver PrecioInvalido.">
              <span>PRECIO (ETH)</span>
              <input value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" />
            </label>
          </div>
        </div>
        <div className="selector" data-tip="Ícono del producto en la vitrina.">
          {ICONOS.map((i) => (
            <button type="button" key={i} className={`selector-op${i === icono ? " selector-activo" : ""}`} onClick={() => setIcono(i)} style={{ color }}>
              {i}
            </button>
          ))}
        </div>
        <div className="selector" data-tip="Color del ícono.">
          {COLORES.map((c) => (
            <button type="button" key={c} aria-label={`Color ${c}`} className={`selector-color${c === color ? " selector-activo" : ""}`} onClick={() => setColor(c)} style={{ background: c }} />
          ))}
        </div>
        <button className="boton-cromo boton-grande" disabled={!!ocupado} data-tip="Despliega el contrato del producto firmado por el Admin (gas gratis en la red local).">
          {ocupado === "agregar" ? "DESPLEGANDO…" : "+ AGREGAR PRODUCTO"}
        </button>
      </form>
    </Ventana>
  );
}

function CajaYComision() {
  const { config, setConfig, productos, cobrarTodo, roles } = useMaquina();
  const { ocupado, cuentas } = useCartera();
  const porCobrar = productos.reduce((s, p) => s + p.caja, 0n);
  const comision = (porCobrar * BigInt(Math.round(config.comision * 100))) / 10000n;
  const saldo = (d?: string) => cuentas.find((c) => c.direccion === d)?.saldo ?? 0n;
  return (
    <Ventana titulo="CAJA_Y_COMISION.CFG" tip="Cómo se reparte el dinero de las ventas entre Admin y Vendedor.">
      <div className="caja">
        <div className="caja-puerta" data-tip="Suma de obtenerBalance() de todos los productos: ventas que todavía están dentro de los contratos.">
          <span className="caja-etiqueta">POR COBRAR</span>
          <span className="caja-monto cromo">{eth(porCobrar, 4)}</span>
          <span className="caja-unidad">ETH</span>
        </div>
        <div className="caja-datos">
          <p className="dato" data-tip="Saldo de la cartera del Admin.">ADMIN ▸ <strong>{eth(saldo(roles?.admin), 4)} ETH</strong></p>
          <p className="dato" data-tip="Saldo de la cartera del Vendedor.">VENDEDOR ▸ <strong>{eth(saldo(roles?.vendedor), 4)} ETH</strong></p>
          <p className="dato" data-tip="Si cobras ahora, esto es lo que recibiría cada uno.">
            REPARTO ▸ {eth(porCobrar - comision, 4)} / {eth(comision, 4)}
          </p>
        </div>
      </div>
      <label className="campo" data-tip="Porcentaje de cada cobro que se transfiere automáticamente de la cartera del Admin a la del Vendedor.">
        <span>COMISIÓN DEL VENDEDOR: {config.comision}%</span>
        <input type="range" min={0} max={50} step={5} value={config.comision} onChange={(e) => setConfig({ ...config, comision: Number(e.target.value) })} />
      </label>
      <label className="interruptor" data-tip="Si está activo, después de cada compra el Admin cobra al instante ese producto (retirarGanancias) y paga la comisión: las carteras se llenan con cada venta. Si no, el dinero se acumula en las cajas hasta que pulses COBRAR.">
        <input type="checkbox" checked={config.cobroAuto} onChange={(e) => setConfig({ ...config, cobroAuto: e.target.checked })} />
        <span className="interruptor-pista" aria-hidden><i /></span>
        COBRO AUTOMÁTICO TRAS CADA VENTA
      </label>
      <div className="acciones">
        <button className="boton-cromo" onClick={() => void cobrarTodo()} disabled={!!ocupado || porCobrar === 0n} data-tip="Llama a retirarGanancias() en cada producto con saldo y paga la comisión de cada cobro.">
          {ocupado === "cobrar" || ocupado === "comision" ? "COBRANDO…" : "◈ COBRAR TODO"}
        </button>
      </div>
    </Ventana>
  );
}

function Fila({ p }: { p: ProductoVivo }) {
  const { editarProducto, cambiarPrecio, cobrar, roles } = useMaquina();
  const { ocupado, avisar } = useCartera();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(p.nombre);
  const [icono, setIcono] = useState(p.icono);
  const [color, setColor] = useState(p.color);
  const [nuevoPrecio, setNuevoPrecio] = useState("");

  function guardar() {
    const n = nombre.trim().toUpperCase();
    if (!n) return avisar("error", "El nombre no puede quedar vacío.");
    editarProducto(p.direccion, { nombre: n.slice(0, 14), icono, color });
    setEditando(false);
    avisar("ok", `${n} actualizado.`);
  }

  async function precio() {
    let wei: bigint;
    try {
      wei = parseEther(nuevoPrecio || "0");
    } catch {
      return avisar("error", "Precio no válido.");
    }
    if (await cambiarPrecio(p.direccion, wei)) setNuevoPrecio("");
  }

  const estados: { e: EstadoProducto; t: string; tip: string }[] = [
    { e: "activo", t: "EN VITRINA", tip: "Visible y a la venta." },
    { e: "oculto", t: "OCULTO", tip: "Fuera de la vitrina. El contrato sigue existiendo; nadie lo ve en la máquina." },
  ];

  return (
    <div className={`item item-${p.estado}`}>
      <div className="item-principal">
        <span className="item-icono" style={{ color: p.color }} data-tip="Ícono del producto.">{p.icono}</span>
        <div className="item-datos">
          <strong data-tip="Nombre del producto (dato de la app).">{p.codigo !== "—" ? `${p.codigo} · ` : ""}{p.nombre}</strong>
          <span data-tip={`Contrato del producto: ${p.direccion}. Dueño: ${p.dueno === roles?.admin ? "Admin" : p.dueno}`}>
            {corta(p.direccion)} · 🔒 {eth(p.precio)} ETH
          </span>
        </div>
        <div className="item-cifras">
          <span data-tip="totalVentas() de este contrato.">{p.ventas.toString()} VENDIDOS</span>
          <span data-tip="obtenerBalance(): lo que hay por cobrar en este producto.">CAJA {eth(p.caja, 4)}</span>
        </div>
        <div className="item-acciones">
          <button className="chip" onClick={() => void cobrar(p.direccion)} disabled={!!ocupado || p.caja === 0n} data-tip="retirarGanancias() de este producto: el dinero pasa al Admin y se paga la comisión al Vendedor.">
            COBRAR
          </button>
          {p.estado !== "archivado" && (
            <button className="chip" onClick={() => setEditando((v) => !v)} data-tip="Editar nombre, ícono, color, visibilidad y precio.">
              {editando ? "CERRAR" : "EDITAR"}
            </button>
          )}
        </div>
      </div>

      {editando && (
        <div className="item-edicion">
          <div className="formulario">
            <label className="campo" data-tip="Nuevo nombre (se guarda en la app, no en el contrato).">
              <span>NOMBRE</span>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={14} />
            </label>
            <div className="selector">
              {ICONOS.map((i) => (
                <button type="button" key={i} className={`selector-op${i === icono ? " selector-activo" : ""}`} onClick={() => setIcono(i)} style={{ color }}>{i}</button>
              ))}
            </div>
            <div className="selector">
              {COLORES.map((c) => (
                <button type="button" key={c} aria-label={`Color ${c}`} className={`selector-color${c === color ? " selector-activo" : ""}`} onClick={() => setColor(c)} style={{ background: c }} />
              ))}
            </div>
            <div className="chips">
              <button className="chip chip-activo" onClick={guardar} data-tip="Guardar nombre, ícono y color.">GUARDAR</button>
              {estados.map((s) => (
                <button
                  key={s.e}
                  className={`chip${p.estado === s.e ? " chip-activo" : ""}`}
                  onClick={() => {
                    editarProducto(p.direccion, { estado: s.e });
                    avisar("ok", `${p.nombre}: ${s.t}.`);
                  }}
                  data-tip={s.tip}
                >
                  {s.t}
                </button>
              ))}
            </div>
          </div>
          <div className="formulario">
            <p className="nota-alerta" data-tip="uint256 public immutable precioArticulo: no existe ninguna función para cambiarlo.">
              🔒 El precio es <code>immutable</code> en el contrato. Cambiarlo despliega un contrato nuevo para este producto y archiva el actual (con su historial y su caja).
            </p>
            <label className="campo" data-tip="Precio del nuevo contrato, en ETH.">
              <span>NUEVO PRECIO (ETH)</span>
              <input value={nuevoPrecio} onChange={(e) => setNuevoPrecio(e.target.value)} placeholder={eth(p.precio)} inputMode="decimal" />
            </label>
            <button className="boton-cromo" onClick={() => void precio()} disabled={!!ocupado || !nuevoPrecio} data-tip="Despliega un nuevo DispensadorDigital con este precio y archiva el actual.">
              {ocupado === "precio" ? "DESPLEGANDO…" : "CAMBIAR PRECIO"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Fondos() {
  const { roles, nombre, recargar } = useMaquina();
  const { cuentas, ocupado } = useCartera();
  if (!roles) return null;
  return (
    <Ventana titulo="FONDOS_COMPRADORES.EXE" tip="Grifo de la red local: solo existe en Hardhat. Sirve para seguir probando si un comprador se queda sin dinero.">
      <ul className="lista-fondos">
        {roles.compradores.map((c) => (
          <li key={c}>
            <span>{nombre(c)}</span>
            <strong>{eth(cuentas.find((x) => x.direccion === c)?.saldo ?? 0n, 4)} ETH</strong>
            <button className="chip" disabled={!!ocupado} onClick={() => void recargar(c)} data-tip="hardhat_setBalance: deja la cartera de este comprador en 10 000 ETH.">
              RECARGAR
            </button>
          </li>
        ))}
      </ul>
    </Ventana>
  );
}

function Reiniciar() {
  const { encender } = useMaquina();
  const { ocupado } = useCartera();
  return (
    <Ventana titulo="REINICIAR.EXE" tip="Zona peligrosa." className="ventana-alerta">
      <p>
        Vuelve a dejar al Admin y al Vendedor en 0 ETH, a los compradores en 10 000 ETH y vacía la vitrina. Los contratos anteriores
        siguen en la cadena, pero la máquina los olvida.
      </p>
      <button
        className="boton-cromo boton-rojo"
        disabled={!!ocupado}
        data-tip="Reinicia la máquina desde cero."
        onClick={() => {
          if (window.confirm("¿Reiniciar la máquina? Se vacía el catálogo y se restablecen las carteras.")) void encender();
        }}
      >
        ⏻ REINICIAR MÁQUINA
      </button>
    </Ventana>
  );
}
