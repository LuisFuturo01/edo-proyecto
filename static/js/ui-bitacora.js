/**
 * Interfaz de la bitácora: generar reportes, conservarlos en la caché del navegador
 * (localStorage), consultarlos, exportarlos e importarlos como JSON.
 */
(function () {
  "use strict";

  const B = window.Bitacora;
  const S = window.Simulador;
  const CLAVE = "agua-segura.bitacora.v1";
  const CLAVE_RESPALDO = `${CLAVE}.respaldo`;
  const MAX_FILAS_HOJA = 200;

  const $ = (id) => document.getElementById(id);
  const modal = $("modal-reporte");
  let reportes = [];
  let abierto = null;
  let graficoHoja = null;

  const fmt = (v, d = 4) => (v === null || v === undefined ? "—" : v.toFixed(d));
  const fmtExp = (v) => (v === null || v === undefined ? "—" : v.toExponential(3));
  const fechaLocal = (iso) => new Date(iso).toLocaleString("es-BO", { dateStyle: "short", timeStyle: "short" });

  function el(etiqueta, propiedades, ...hijos) {
    const nodo = document.createElement(etiqueta);
    Object.assign(nodo, propiedades);
    nodo.append(...hijos);
    return nodo;
  }

  function avisar(texto, tipo = "") {
    const nodo = $("estado-bitacora");
    nodo.textContent = texto;
    nodo.className = `estado-bitacora ${tipo}`;
    nodo.hidden = !texto;
  }

  function guardar() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(B.exportar(reportes)));
      return true;
    } catch {
      avisar("No se pudo guardar en la caché del navegador. Exporte la bitácora para no perder estos reportes.", "alerta");
      return false;
    }
  }

  function leerCache() {
    let crudo = null;
    try {
      crudo = localStorage.getItem(CLAVE);
    } catch {
      avisar("Este navegador bloquea la caché: los reportes sólo durarán esta sesión. Expórtelos antes de cerrar.", "alerta");
      return [];
    }
    if (!crudo) return [];
    try {
      const salida = B.importar(crudo);
      if (salida.rechazados.length) {
        localStorage.setItem(CLAVE_RESPALDO, crudo);
        avisar(`Se omitieron reportes dañados de la caché: ${salida.rechazados.length}.`, "alerta");
      }
      return salida.reportes;
    } catch {
      localStorage.setItem(CLAVE_RESPALDO, crudo);
      avisar("La caché de la bitácora estaba dañada. Se conservó una copia de respaldo y se inició vacía.", "alerta");
      return [];
    }
  }

  function coincideBusqueda(r, texto) {
    return !texto || `${r.titulo} ${r.notas} ${fechaLocal(r.fecha)}`.toLowerCase().includes(texto);
  }

  function pintarLista() {
    const texto = $("buscar-bitacora").value.trim().toLowerCase();
    const visibles = reportes.filter((r) => coincideBusqueda(r, texto));
    const accion = (etiqueta, nombre) => el("button", { type: "button", className: "boton-secundario compacto", textContent: etiqueta, title: nombre });
    $("lista-bitacora").replaceChildren(...visibles.map((r) => {
      const ver = accion("Ver", "Abrir reporte");
      ver.dataset.accion = "ver";
      const cargar = accion("Cargar", "Cargar sus datos en el simulador");
      cargar.dataset.accion = "cargar";
      const eliminar = accion("Eliminar", "Eliminar de la bitácora");
      eliminar.dataset.accion = "eliminar";
      const fila = el("tr", {},
        el("td", { textContent: fechaLocal(r.fecha) }),
        el("td", { className: "texto", textContent: r.titulo, title: r.notas }),
        el("td", { textContent: r.parametros.c0 }),
        el("td", { textContent: fmt(r.resultados.k, 3) }),
        el("td", { textContent: r.parametros.h }),
        el("td", { textContent: r.parametros.c0 <= r.parametros.cSegura ? "0" : fmt(r.resultados.tExacto, 2) }),
        el("td", { textContent: fmtExp(r.resultados.errMaxRk4) }),
        el("td", { className: "acciones" }, ver, cargar, eliminar));
      fila.dataset.id = r.id;
      return fila;
    }));
    const vacia = reportes.length === 0;
    $("bitacora-vacia").hidden = !vacia;
    $("contenedor-bitacora").hidden = vacia;
    $("exportar-bitacora").disabled = vacia;
    $("vaciar-bitacora").disabled = vacia;
    $("contador-bitacora").textContent = vacia ? "" : `Mostrando ${visibles.length} de ${reportes.length}`;
  }

  function tablaDatos(encabezados, filas) {
    return el("div", { className: "tabla-scroll" }, el("table", {},
      el("thead", {}, el("tr", {}, ...encabezados.map((t) => el("th", { textContent: t })))),
      el("tbody", {}, ...filas.map((f) => el("tr", {}, ...f.map((v) => el("td", { textContent: v })))))));
  }

  function muestraFilas(filas) {
    if (filas.length <= MAX_FILAS_HOJA) return filas;
    const salto = Math.ceil(filas.length / MAX_FILAS_HOJA);
    const salida = filas.filter((_, i) => i % salto === 0);
    if (salida[salida.length - 1] !== filas[filas.length - 1]) salida.push(filas[filas.length - 1]);
    return salida;
  }

  function cerrarReporte() {
    if (graficoHoja) graficoHoja.destroy();
    graficoHoja = null;
    abierto = null;
    if (modal.open) modal.close();
  }

  function abrirReporte(r) {
    abierto = r;
    const p = r.parametros;
    const res = r.resultados;
    const a = B.analizar(p);
    const filas = muestraFilas(a.filas);
    const lienzo = el("canvas", { role: "img", ariaLabel: "Concentración frente al tiempo: analítica, Heun y RK4." });
    const hijos = [
      el("p", { className: "sobretitulo", textContent: "Reporte de simulación · Agua Segura" }),
      el("h2", { textContent: r.titulo }),
      el("p", { className: "hoja-fecha", textContent: `${fechaLocal(r.fecha)} · Identificador ${r.id}` }),
    ];
    if (r.notas) hijos.push(el("p", { className: "hoja-notas", textContent: r.notas }));
    hijos.push(
      el("h3", { textContent: "Datos del problema" }),
      tablaDatos(["V [L]", "Q [L/h]", "k [h⁻¹]", "C₀ [mg/L]", "C segura [mg/L]", "T [h]", "h [h]", "Pasos"], [[p.volumen, p.caudal, Number(res.k.toPrecision(6)), p.c0, p.cSegura, p.tFinal, p.h, res.pasos]]),
      el("h3", { textContent: "Modelo" }),
      el("p", { className: "formula", textContent: "dC/dt = −k·C,  C(0) = C₀,  C(t) = C₀·e^(−k·t),  t* = ln(C₀/C_s)/k" }),
      el("h3", { textContent: "Resultados" }),
      tablaDatos(["", "t al umbral [h]", "Error máx. [mg/L]"], [
        ["Solución exacta", fmt(res.tExacto, 5), "—"],
        ["Heun", fmt(res.cruceHeun, 5), fmtExp(res.errMaxHeun)],
        ["RK4", fmt(res.cruceRk4, 5), fmtExp(res.errMaxRk4)],
      ]),
      el("h3", { textContent: "Interpretación" }),
      ...r.interpretacion.map((t) => el("p", { textContent: t })),
    );
    if (r.aviso) hijos.push(el("p", { className: "aviso", textContent: r.aviso }));
    hijos.push(
      el("div", { className: "lienzo lienzo-hoja" }, lienzo),
      el("h3", { textContent: "Comparación de tamaños de paso" }),
      tablaDatos(["h [h]", "Pasos", "E máx. Heun", "E máx. RK4", "E % final Heun", "E % final RK4", "t* Heun", "t* RK4"],
        r.comparacion.map((c) => [c.h, c.pasos, fmtExp(c.errMaxHeun), fmtExp(c.errMaxRk4), fmtExp(c.errRelFinalHeun), fmtExp(c.errRelFinalRk4), fmt(c.cruceHeun, 5), fmt(c.cruceRk4, 5)])),
      el("h3", { textContent: "Tabla paso a paso" }),
      el("p", { className: "hoja-fecha", textContent: filas.length < a.filas.length ? `Muestra de ${filas.length} de ${a.filas.length} nodos; el CSV contiene todos.` : `${a.filas.length} nodos.` }),
      tablaDatos(["t [h]", "C exacta", "C Heun", "C RK4", "E abs Heun", "E abs RK4", "E % Heun", "E % RK4"],
        filas.map((f) => [fmt(f.t, 3), fmt(f.analitica, 6), fmt(f.heun, 6), fmt(f.rk4, 6), fmtExp(f.errAbsHeun), fmtExp(f.errAbsRk4), fmtExp(f.errRelHeun), fmtExp(f.errRelRk4)])),
      el("p", { className: "hoja-fecha", textContent: "Simulación educativa con parámetros hipotéticos: no reemplaza un análisis de laboratorio ni autoriza el consumo del agua." }),
    );
    const hoja = $("hoja-reporte");
    hoja.replaceChildren(...hijos);
    modal.showModal();
    modal.scrollTop = 0;
    if (graficoHoja) graficoHoja.destroy();
    graficoHoja = S.dibujarConcentracion(lienzo, a.p, a.filas, { raiz: hoja, animar: false });
  }

  function agregar(reporte) {
    reportes = B.ordenar([reporte, ...reportes]);
    const persistido = guardar();
    pintarLista();
    return persistido;
  }

  function generar() {
    const parametros = S.parametrosActuales();
    if (!parametros) return;
    const reporte = B.crearReporte(parametros, { titulo: $("titulo-reporte").value, notas: $("notas-reporte").value });
    if (agregar(reporte)) avisar(`Reporte «${reporte.titulo}» guardado en la bitácora.`, "bien");
    $("titulo-reporte").value = "";
    $("notas-reporte").value = "";
    abrirReporte(reporte);
  }

  function eliminar(id) {
    const r = reportes.find((x) => x.id === id);
    if (!r || !window.confirm(`¿Eliminar el reporte «${r.titulo}»? Sólo se puede recuperar desde un archivo exportado.`)) return false;
    reportes = reportes.filter((x) => x.id !== id);
    guardar();
    pintarLista();
    return true;
  }

  function nombreArchivo(sufijo) {
    return `bitacora_agua_segura_${new Date().toISOString().slice(0, 10)}${sufijo}.json`;
  }

  function descargarBitacora(lista, sufijo = "") {
    S.descargar(nombreArchivo(sufijo), JSON.stringify(B.exportar(lista), null, 2), "application/json");
  }

  async function importarArchivo(archivo) {
    try {
      const salida = B.importar(await archivo.text(), reportes);
      reportes = salida.reportes;
      const persistido = guardar();
      pintarLista();
      if (!persistido) return;
      const partes = [`Importados de «${archivo.name}»: ${salida.agregados}`];
      if (salida.duplicados) partes.push(`ya estaban en la bitácora: ${salida.duplicados}`);
      if (salida.rechazados.length) {
        const motivos = salida.rechazados.slice(0, 3).map((x) => `n.º ${x.indice + 1}: ${x.motivo}`).join("; ");
        partes.push(`rechazados: ${salida.rechazados.length} (${motivos})`);
      }
      avisar(`${partes.join("; ")}.`, salida.rechazados.length ? "alerta" : "bien");
    } catch (error) {
      avisar(`No se importó «${archivo.name}»: ${error.message}`, "alerta");
    }
  }

  function enlazar() {
    $("generar-reporte").addEventListener("click", generar);
    $("buscar-bitacora").addEventListener("input", pintarLista);
    $("exportar-bitacora").addEventListener("click", () => {
      descargarBitacora(reportes);
      avisar(`Bitácora exportada. Reportes en el archivo: ${reportes.length}.`, "bien");
    });
    $("importar-bitacora").addEventListener("click", () => $("archivo-bitacora").click());
    $("archivo-bitacora").addEventListener("change", async (e) => {
      const [archivo] = e.target.files;
      e.target.value = "";
      if (archivo) await importarArchivo(archivo);
    });
    $("vaciar-bitacora").addEventListener("click", () => {
      if (!window.confirm(`¿Vaciar la bitácora de este navegador (reportes: ${reportes.length})? Sólo se puede recuperar desde un archivo exportado.`)) return;
      reportes = [];
      guardar();
      pintarLista();
      avisar("Bitácora vaciada.");
    });
    $("lista-bitacora").addEventListener("click", (e) => {
      const accion = e.target.dataset.accion;
      if (!accion) return;
      const id = e.target.closest("tr").dataset.id;
      const r = reportes.find((x) => x.id === id);
      if (accion === "ver") abrirReporte(r);
      if (accion === "eliminar") eliminar(id);
      if (accion === "cargar") {
        S.cargarParametros(r.parametros);
        avisar(`Datos de «${r.titulo}» cargados en el simulador.`, "bien");
        window.scrollTo({ top: $("formulario").offsetTop - 16, behavior: "smooth" });
      }
    });
    $("reporte-cerrar").addEventListener("click", cerrarReporte);
    modal.addEventListener("close", cerrarReporte);
    modal.addEventListener("click", (e) => { if (e.target === modal) cerrarReporte(); });
    $("reporte-imprimir").addEventListener("click", () => window.print());
    $("reporte-json").addEventListener("click", () => descargarBitacora([abierto], `_${abierto.id}`));
    $("reporte-csv").addEventListener("click", () => S.descargar(`reporte_${abierto.id}.csv`, S.tablaCsv(B.analizar(abierto.parametros).filas), "text/csv"));
    $("reporte-cargar").addEventListener("click", () => {
      S.cargarParametros(abierto.parametros);
      avisar(`Datos de «${abierto.titulo}» cargados en el simulador.`, "bien");
      cerrarReporte();
    });
    $("reporte-eliminar").addEventListener("click", () => {
      if (eliminar(abierto.id)) cerrarReporte();
    });
    window.addEventListener("storage", (e) => {
      if (e.key === CLAVE) {
        reportes = leerCache();
        pintarLista();
      }
    });
  }

  enlazar();
  reportes = leerCache();
  pintarLista();
})();
