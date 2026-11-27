import { useEffect, useState } from "react";

/**
 * Descripción emergente global: cualquier elemento con el atributo
 * `data-tip="..."` muestra su explicación al pasar el cursor o al enfocarlo
 * con el teclado. Así cada objeto de la interfaz puede describirse a sí mismo.
 */
type Estado = { texto: string; x: number; y: number; abajo: boolean };

export function Burbuja() {
  const [tip, setTip] = useState<Estado | null>(null);

  useEffect(() => {
    let actual: Element | null = null;

    function mostrar(ev: Event) {
      const destino = ev.target as Element | null;
      const el = destino?.closest?.("[data-tip]") ?? null;
      if (el === actual) return;
      actual = el;
      const texto = el?.getAttribute("data-tip");
      if (!el || !texto) {
        setTip(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const abajo = r.top < 110;
      const x = Math.min(Math.max(r.left + r.width / 2, 170), window.innerWidth - 170);
      setTip({ texto, x, y: abajo ? r.bottom + 10 : r.top - 10, abajo });
    }
    function ocultar() {
      actual = null;
      setTip(null);
    }

    document.addEventListener("mouseover", mostrar);
    document.addEventListener("focusin", mostrar);
    document.addEventListener("focusout", ocultar);
    window.addEventListener("scroll", ocultar, true);
    document.documentElement.addEventListener("mouseleave", ocultar);
    return () => {
      document.removeEventListener("mouseover", mostrar);
      document.removeEventListener("focusin", mostrar);
      document.removeEventListener("focusout", ocultar);
      window.removeEventListener("scroll", ocultar, true);
      document.documentElement.removeEventListener("mouseleave", ocultar);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      role="tooltip"
      className={`burbuja${tip.abajo ? " burbuja-abajo" : ""}`}
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.texto}
    </div>
  );
}
