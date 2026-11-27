import { Link } from "react-router";
import { Ventana } from "../App";
import { useCartera } from "../cartera";
import { corta, eth } from "../chain";
import { ROL_DESCRIPCION, ROL_TEXTO, useMaquina, type Rol } from "../maquina";

export default function Terminal() {
  const { conectado, encendida, errorNodo } = useCartera();

  return (
    <div className="rejilla">
      <section className="heroe">
        <p className="heroe-etiqueta" data-tip="Cada producto de la máquina es un contrato DispensadorDigital con su propio precio fijo.">
          ◆ MÁQUINA DISPENSADORA · v2.0 · RED LOCAL 31337
        </p>
        <h1 className="heroe-titulo cromo">MÁQUINA DE VENTA EN CADENA</h1>
        <p className="heroe-texto">
          El Admin carga productos (cada uno es un contrato en la blockchain), los compradores compran con su cartera, y las
          ventas llenan las carteras del Admin y del Vendedor, que empiezan vacías.
        </p>
      </section>

      {!conectado && <NodoApagado error={errorNodo} />}
      {conectado && !encendida && <Encender />}
      {conectado && encendida && (
        <>
          <Bienvenida />
          <Usuarios />
        </>
      )}
      <Flujo />
    </div>
  );
}

function NodoApagado({ error }: { error: string }) {
  return (
    <Ventana titulo="CONEXION.EXE" className="ventana-alerta col-ancha" tip="La interfaz no encuentra el nodo blockchain.">
      <p className="pixel-grande">⚠ NODO BLOCKCHAIN SIN RESPUESTA</p>
      <p>{error}</p>
      <p>En el servidor, el servicio <code>blockchain</code> del docker compose debe estar en ejecución. En local:</p>
      <pre className="consola" data-tip="Arranca la blockchain con 20 cuentas de prueba.">{"cd blockchain\nnpm run nodo"}</pre>
      <p>Esta pantalla se conectará sola en cuanto el nodo responda.</p>
    </Ventana>
  );
}

function Encender() {
  const { encender } = useMaquina();
  const { ocupado } = useCartera();
  return (
    <Ventana titulo="ENCENDER.EXE" tip="Prepara la red local para la máquina." className="ventana-principal col-ancha">
      <p className="pixel-grande" style={{ color: "#7a2bff" }}>▶ LA MÁQUINA ESTÁ APAGADA</p>
      <p>Al encenderla se prepara la red local de Hardhat:</p>
      <ul className="lista-pixel">
        <li data-tip="hardhat_setBalance(admin, 0) y hardhat_setBalance(vendedor, 0): sus carteras solo se llenarán con las ventas.">
          Las carteras del <strong>Admin</strong> (cuenta 0) y del <strong>Vendedor</strong> (cuenta 1) quedan en <strong>0 ETH</strong>.
        </li>
        <li data-tip="hardhat_setBalance(comprador, 10000 ETH) para las cuentas 2, 3 y 4.">
          Los <strong>Compradores 1, 2 y 3</strong> (cuentas 2 a 4) reciben <strong>10 000 ETH</strong> cada uno.
        </li>
        <li data-tip="hardhat_setNextBlockBaseFeePerGas(0) y las transacciones se envían con comisión 0. Así los saldos solo cambian por compras, cobros y comisiones, y el Admin puede operar con su cartera vacía.">
          El <strong>gas pasa a ser gratis</strong> en la red local, para que los saldos sean exactos.
        </li>
        <li data-tip="El catálogo guardado en el navegador se vacía: la máquina empieza sin productos.">
          La máquina arranca <strong>sin productos</strong>: el Admin debe agregarlos.
        </li>
      </ul>
      <div className="acciones">
        <button className="boton-cromo boton-grande" onClick={() => void encender()} disabled={!!ocupado} data-tip="Ejecuta la preparación y deja activo al Admin.">
          {ocupado === "encender" ? "ENCENDIENDO…" : "⏻ ENCENDER MÁQUINA"}
        </button>
      </div>
    </Ventana>
  );
}

const QUE_PUEDE: Record<Rol, { texto: string; enlaces: { a: string; t: string; tip: string }[] }> = {
  admin: {
    texto: "Tienes acceso total. Empieza agregando productos: cada uno se despliega como un contrato con su precio.",
    enlaces: [
      { a: "/admin", t: "⚙ PANEL ADMIN", tip: "Agregar y editar productos, cobrar y configurar la comisión." },
      { a: "/ventas", t: "≡ VENTAS", tip: "Ver el reporte de ventas." },
      { a: "/maquina", t: "▣ MÁQUINA", tip: "Ver la vitrina." },
    ],
  },
  vendedor: {
    texto: "Puedes revisar las ventas, las cajas y el historial, pero no editar nada. Tu cartera recibe la comisión de cada cobro.",
    enlaces: [
      { a: "/ventas", t: "≡ VER VENTAS", tip: "Reporte de ventas (solo lectura)." },
      { a: "/maquina", t: "▣ VER VITRINA", tip: "Ver los productos disponibles." },
    ],
  },
  comprador: {
    texto: "Elige un producto en la máquina y cómpralo con el dinero de tu cartera.",
    enlaces: [
      { a: "/maquina", t: "▣ IR A COMPRAR", tip: "Ir a la máquina dispensadora." },
      { a: "/mis-compras", t: "✉ MIS COMPRAS", tip: "Ver tus tickets." },
    ],
  },
};

function Bienvenida() {
  const { rolActivo, nombre, vitrina } = useMaquina();
  const { activa } = useCartera();
  if (!rolActivo) return null;
  const q = QUE_PUEDE[rolActivo];
  return (
    <Ventana titulo={`SESION_${ROL_TEXTO[rolActivo]}.EXE`} tip={ROL_DESCRIPCION[rolActivo]} className="ventana-principal">
      <p className="pixel-grande" style={{ color: "#7a2bff" }}>HOLA, {nombre(activa).toUpperCase()}</p>
      <p>{q.texto}</p>
      {rolActivo === "admin" && vitrina.length === 0 && (
        <p className="nota-alerta">⚠ La vitrina está vacía. Agrega el primer producto desde el panel Admin.</p>
      )}
      <div className="acciones">
        {q.enlaces.map((e) => (
          <Link key={e.a} to={e.a} className="boton-cromo" data-tip={e.tip}>{e.t}</Link>
        ))}
      </div>
    </Ventana>
  );
}

function Usuarios() {
  const { roles, nombre, rol } = useMaquina();
  const { cuentas, activa, setActiva, avisar } = useCartera();
  if (!roles) return null;
  const lista = [roles.admin, roles.vendedor, ...roles.compradores];
  return (
    <Ventana titulo="USUARIOS.DAT" tip="Las carteras de la máquina. Clic en una tarjeta para actuar como ese usuario.">
      <div className="usuarios">
        {lista.map((d) => {
          const r = rol(d)!;
          const saldo = cuentas.find((c) => c.direccion === d)?.saldo ?? 0n;
          return (
            <button
              key={d}
              className={`usuario${d === activa ? " usuario-activo" : ""}`}
              data-tip={`${ROL_DESCRIPCION[r]} Dirección: ${d}`}
              onClick={() => {
                setActiva(d);
                avisar("info", `Ahora actúas como ${nombre(d)}.`);
              }}
            >
              <span className={`insignia insignia-${r}`}>{ROL_TEXTO[r]}</span>
              <span className="usuario-nombre">{nombre(d)}</span>
              <span className="usuario-saldo">{eth(saldo, 4)} ETH</span>
              <span className="usuario-dir">{corta(d)}</span>
            </button>
          );
        })}
      </div>
    </Ventana>
  );
}

function Flujo() {
  return (
    <Ventana titulo="COMO_FUNCIONA.TXT" tip="Recorrido del dinero en la máquina." className="col-ancha">
      <div className="flujo">
        <div className="flujo-nodo" data-tip="El comprador llama a comprar() en el contrato del producto, enviando ETH desde su cartera (msg.value).">
          <span className="flujo-icono">☻</span>
          <strong>COMPRADOR</strong>
          <span>paga el precio</span>
        </div>
        <span className="flujo-flecha" aria-hidden>▶</span>
        <div className="flujo-nodo" data-tip="Cada producto es un contrato DispensadorDigital: precio immutable, totalVentas y su propio balance (la caja). Emite CompraExitosa.">
          <span className="flujo-icono">▣</span>
          <strong>CONTRATO DEL PRODUCTO</strong>
          <span>guarda el ETH en su caja</span>
        </div>
        <span className="flujo-flecha" aria-hidden>▶</span>
        <div className="flujo-nodo" data-tip="El Admin desplegó el contrato, así que es su dueño: solo él puede llamar a retirarGanancias(). Emite FondosRetirados.">
          <span className="flujo-icono">⚙</span>
          <strong>ADMIN</strong>
          <span>cobra con retirarGanancias()</span>
        </div>
        <span className="flujo-flecha" aria-hidden>▶</span>
        <div className="flujo-nodo" data-tip="Después de cada cobro, la app envía desde la cartera del Admin una transferencia con el % de comisión al Vendedor.">
          <span className="flujo-icono">$</span>
          <strong>VENDEDOR</strong>
          <span>recibe su comisión %</span>
        </div>
      </div>
      <p className="nota-chica">
        ¿Por qué un contrato por producto? En DispensadorDigital.sol el precio es <code>immutable</code>: se fija al desplegar y no
        cambia nunca. Para tener productos con precios distintos, cada uno vive en su propio contrato con su propia dirección,
        ventas y caja.
      </p>
    </Ventana>
  );
}
