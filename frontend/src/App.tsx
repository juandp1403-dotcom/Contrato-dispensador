import type { ReactNode } from "react";
import { Link, NavLink, Route, Routes } from "react-router";
import { Burbuja } from "./Burbuja";
import { CarteraProvider, useCartera } from "./cartera";
import { corta, eth, RPC_URL } from "./chain";
import { MaquinaProvider, ROL_DESCRIPCION, ROL_TEXTO, traducirError, useMaquina, type Rol } from "./maquina";
import Terminal from "./paginas/Terminal";
import Comprar from "./paginas/Comprar";
import MisCompras from "./paginas/MisCompras";
import Ventas from "./paginas/Ventas";
import Admin from "./paginas/Admin";

export default function App() {
  return (
    <CarteraProvider prefijo="dispensador" traducirError={traducirError}>
      <MaquinaProvider>
        <Escritorio />
      </MaquinaProvider>
    </CarteraProvider>
  );
}

const RUTAS: { a: string; icono: string; texto: string; tip: string; roles: Rol[] }[] = [
  { a: "/", icono: "⌂", texto: "Terminal", tip: "Inicio: encender la máquina, ver quién es quién y el saldo de cada cartera.", roles: ["admin", "vendedor", "comprador"] },
  { a: "/maquina", icono: "▣", texto: "Máquina", tip: "La máquina dispensadora: elige un producto y cómpralo. Cada producto es su propio contrato DispensadorDigital.", roles: ["admin", "vendedor", "comprador"] },
  { a: "/mis-compras", icono: "✉", texto: "Mis compras", tip: "Tus tickets: compras que hizo la cuenta activa (eventos CompraExitosa con tu dirección).", roles: ["comprador"] },
  { a: "/ventas", icono: "≡", texto: "Ventas", tip: "Reporte de ventas de todos los productos: ingresos, cajas, cobros y comisiones. Solo lectura para el vendedor.", roles: ["admin", "vendedor"] },
  { a: "/admin", icono: "⚙", texto: "Admin", tip: "Panel del administrador: agregar productos (desplegar contratos), editar el catálogo, cobrar y configurar la comisión.", roles: ["admin"] },
];

function Escritorio() {
  return (
    <div className="escritorio">
      <div className="cielo" aria-hidden />
      <div className="piso" aria-hidden />
      <BarraSuperior />
      <main className="contenido">
        <Routes>
          <Route path="/" element={<Terminal />} />
          <Route path="/maquina" element={<ConRed><Comprar /></ConRed>} />
          <Route path="/mis-compras" element={<ConRed><ConRol roles={["comprador"]}><MisCompras /></ConRol></ConRed>} />
          <Route path="/ventas" element={<ConRed><ConRol roles={["admin", "vendedor"]}><Ventas /></ConRol></ConRed>} />
          <Route path="/admin" element={<ConRed><ConRol roles={["admin"]}><Admin /></ConRol></ConRed>} />
          <Route path="*" element={<NoEncontrado />} />
        </Routes>
      </main>
      <BarraEstado />
      <Avisos />
      <Burbuja />
    </div>
  );
}

function BarraSuperior() {
  const { rolActivo } = useMaquina();
  const visibles = RUTAS.filter((r) => !rolActivo || r.roles.includes(rolActivo));
  return (
    <header className="barra">
      <Link to="/" className="logo" data-tip="DISPENSA-2000: máquina dispensadora sobre contratos DispensadorDigital.sol en tu red local de Hardhat.">
        <span className="logo-pixel" aria-hidden />
        <span className="cromo">DISPENSA</span>
        <span className="logo-num">2000</span>
      </Link>
      <nav className="nav">
        {visibles.map((r) => (
          <NavLink key={r.a} to={r.a} end className="nav-btn" data-tip={r.tip}>
            <span className="nav-icono" aria-hidden>{r.icono}</span>
            {r.texto}
          </NavLink>
        ))}
      </nav>
      <SelectorCuenta />
    </header>
  );
}

function SelectorCuenta() {
  const { cuentas, activa, setActiva, conectado, avisar } = useCartera();
  const { nombre, roles, rolActivo } = useMaquina();
  const conRol = roles ? [roles.admin, roles.vendedor, ...roles.compradores] : [];
  const actual = cuentas.find((c) => c.direccion === activa);
  return (
    <div
      className="cartera"
      data-tip="Cartera local: elige con qué usuario actúas. Cuenta 0 = Admin, cuenta 1 = Vendedor, cuentas 2 a 4 = Compradores. La cuenta elegida firma las transacciones (msg.sender). Sin MetaMask."
    >
      <span className="cartera-titulo">USUARIO</span>
      <select
        value={activa}
        disabled={!conectado}
        onChange={(e) => {
          setActiva(e.target.value);
          avisar("info", `Ahora actúas como ${nombre(e.target.value)}.`);
        }}
        aria-label="Usuario activo"
      >
        {cuentas
          .filter((c) => conRol.includes(c.direccion))
          .map((c) => (
            <option key={c.direccion} value={c.direccion}>
              {nombre(c.direccion)} · {corta(c.direccion)}
            </option>
          ))}
      </select>
      {rolActivo && <span className={`insignia insignia-${rolActivo}`} data-tip={ROL_DESCRIPCION[rolActivo]}>{ROL_TEXTO[rolActivo]}</span>}
      {actual && (
        <span className="cartera-saldo" data-tip="Saldo de la cartera del usuario activo en la red local (fondos de práctica sin valor real).">
          {eth(actual.saldo, 4)} ETH
        </span>
      )}
    </div>
  );
}

function BarraEstado() {
  const { conectado, bloque, errorNodo, ocupado, encendida } = useCartera();
  const { vitrina, config } = useMaquina();
  return (
    <footer className="estado">
      <span className="estado-item" data-tip={conectado ? `Conectado al nodo blockchain por ${RPC_URL} (chainId 31337).` : errorNodo}>
        <span className={`led ${conectado ? "led-on" : "led-off"}`} aria-hidden />
        {conectado ? "NODO EN LÍNEA" : "NODO APAGADO"}
      </span>
      <span className="estado-item" data-tip="Máquina encendida = la red local tiene gas gratis y las carteras preparadas.">
        <span className={`led ${encendida ? "led-on" : "led-off"}`} aria-hidden />
        {encendida ? "MÁQUINA ON" : "MÁQUINA OFF"}
      </span>
      <span className="estado-item" data-tip="Número del último bloque minado. Hardhat mina un bloque por cada transacción.">
        BLOQUE #{bloque >= 0 ? bloque : "—"}
      </span>
      <span className="estado-item" data-tip="Productos en vitrina. Cada uno es un contrato DispensadorDigital distinto.">
        PRODUCTOS {vitrina.length}
      </span>
      <span className="estado-item" data-tip="Comisión del vendedor y modo de cobro configurados por el Admin.">
        COMISIÓN {config.comision}% · {config.cobroAuto ? "AUTO" : "MANUAL"}
      </span>
      <span className="estado-item estado-der">{ocupado ? <span className="parpadeo">▓ PROCESANDO…</span> : "LISTO_"}</span>
    </footer>
  );
}

function Avisos() {
  const { avisos, cerrarAviso } = useCartera();
  return (
    <div className="avisos" aria-live="polite">
      {avisos.map((a) => (
        <button key={a.id} className={`aviso aviso-${a.tipo}`} onClick={() => cerrarAviso(a.id)} data-tip="Clic para cerrar">
          <span className="aviso-icono">{a.tipo === "ok" ? "✔" : a.tipo === "error" ? "✖" : "»"}</span>
          {a.texto}
        </button>
      ))}
    </div>
  );
}

/** Ventana estilo sistema operativo retro. */
export function Ventana({ titulo, tip, children, className = "" }: { titulo: string; tip?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`ventana ${className}`}>
      <div className="ventana-barra" data-tip={tip}>
        <span className="ventana-titulo">{titulo}</span>
        <span className="ventana-botones" aria-hidden>
          <i>_</i>
          <i>▢</i>
          <i>×</i>
        </span>
      </div>
      <div className="ventana-cuerpo">{children}</div>
    </section>
  );
}

function ConRed({ children }: { children: ReactNode }) {
  const { conectado, encendida } = useCartera();
  if (conectado && encendida) return <>{children}</>;
  return (
    <Ventana titulo="ERROR.EXE" className="ventana-alerta">
      <p className="pixel-grande">⚠ MÁQUINA APAGADA</p>
      <p>
        {conectado
          ? "La red local todavía no está preparada para la máquina (o el nodo se reinició). Enciéndela desde la Terminal."
          : "El nodo blockchain no responde. Revisa que el servicio «blockchain» esté en ejecución."}
      </p>
      <Link to="/" className="boton-cromo" data-tip="Ir a la terminal.">IR A LA TERMINAL</Link>
    </Ventana>
  );
}

function ConRol({ roles: permitidos, children }: { roles: Rol[]; children: ReactNode }) {
  const { rolActivo, roles, nombre } = useMaquina();
  const { setActiva, avisar } = useCartera();
  if (rolActivo && permitidos.includes(rolActivo)) return <>{children}</>;
  const destino = permitidos[0] === "admin" ? roles?.admin : permitidos[0] === "vendedor" ? roles?.vendedor : roles?.compradores[0];
  return (
    <Ventana titulo="ACCESO_DENEGADO.SYS" className="ventana-alerta" tip="Control de acceso por rol de la interfaz.">
      <p className="pixel-grande">⛔ ACCESO DENEGADO</p>
      <p>
        Esta sección es solo para: <strong>{permitidos.map((r) => ROL_TEXTO[r]).join(" / ")}</strong>.
        {rolActivo && ` Ahora actúas como ${ROL_TEXTO[rolActivo]}.`}
      </p>
      {destino && (
        <button
          className="boton-cromo"
          data-tip="Cambia el usuario activo de la cartera local."
          onClick={() => {
            setActiva(destino);
            avisar("info", `Ahora actúas como ${nombre(destino)}.`);
          }}
        >
          ACTUAR COMO {nombre(destino).toUpperCase()}
        </button>
      )}
    </Ventana>
  );
}

function NoEncontrado() {
  return (
    <Ventana titulo="404.SYS" className="ventana-alerta">
      <p className="pixel-grande">404 · RUTA NO ENCONTRADA</p>
      <Link to="/" className="boton-cromo">VOLVER</Link>
    </Ventana>
  );
}
