/** Burbuja flotante y modal que consume dinámicamente estudiantes.json. */
(function () {
  "use strict";

  const RUTA_DATOS = "../estudiantes.json";
  const modal = document.getElementById("modal-estudiantes");
  const lista = document.getElementById("lista-estudiantes");
  let cargado = false;

  function iniciales(nombre) {
    return nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
  }

  function elemento(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    nodo.className = clase;
    nodo.textContent = texto;
    return nodo;
  }

  async function cargarEstudiantes() {
    try {
      const respuesta = await fetch(RUTA_DATOS, { cache: "no-store" });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const estudiantes = await respuesta.json();
      lista.replaceChildren(
        ...estudiantes.map((e, i) => {
          const fila = document.createElement("li");
          fila.style.animationDelay = `${i * 70}ms`;
          const datos = document.createElement("div");
          datos.append(
            elemento("div", "estudiante-nombre", e.nombre),
            elemento("div", "estudiante-datos", `CI: ${e.ci} · RU: ${e.ru}`)
          );
          fila.append(elemento("span", "avatar", iniciales(e.nombre)), datos);
          return fila;
        })
      );
      cargado = true;
    } catch (error) {
      lista.replaceChildren(elemento("li", "", `No se pudo leer estudiantes.json (${error.message}). Sirva el proyecto por HTTP.`));
    }
  }

  document.getElementById("burbuja-estudiantes").addEventListener("click", () => {
    modal.showModal();
    if (!cargado) cargarEstudiantes();
  });
  document.getElementById("modal-cerrar").addEventListener("click", () => modal.close());
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); });
})();
