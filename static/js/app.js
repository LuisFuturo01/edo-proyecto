/** Controlador del simulador: lee lo escrito por teclado, ejecuta el núcleo y actualiza la vista. */
(function () {
  "use strict";

  const N = window.Numerics;
  const B = window.Bitacora;
  const FILAS_POR_PAGINA = 100;
  const MAX_PUNTOS_GRAFICO = 600;
  const CASO_BASE = { volumen: 1000, caudal: 100, c0: 50, cSegura: 5, tFinal: 48, h: 1 };
  const CAMPOS = Object.keys(CASO_BASE);

  const $ = (id) => document.getElementById(id);
  const estado = { filas: [], pagina: 0, parametros: null };
  const graficos = new Map();

  const fmt = (v, d = 4) => (v === null || !Number.isFinite(v) ? "—" : v.toFixed(d));
  const fmtExp = (v) => (v === null || !Number.isFinite(v) ? "—" : v.toExponential(3));
  const redondear = (v) => String(Number(v.toPrecision(12)));

  function aHorasMinutos(horas) {
    let h = Math.floor(horas);
    let m = Math.round((horas - h) * 60);
    if (m === 60) { h += 1; m = 0; }
    return `${h} h ${m} min`;
  }

  function leerParametros() {
    const p = {};
    for (const campo of CAMPOS) p[campo] = N.leerNumero($(campo).value);
    return p;
  }

  function mostrarErrores(errores) {
    document.querySelectorAll(".campo[data-campo]").forEach((nodo) => {
      const mensaje = errores[nodo.dataset.campo] || "";
      nodo.classList.toggle("invalido", Boolean(mensaje));
      nodo.querySelector(".error").textContent = mensaje;
      nodo.querySelector("input").setAttribute("aria-invalid", String(Boolean(mensaje)));
    });
  }

  function submuestrear(filas) {
    if (filas.length <= MAX_PUNTOS_GRAFICO) return filas;
    const salto = Math.ceil(filas.length / MAX_PUNTOS_GRAFICO);
    const salida = filas.filter((_, i) => i % salto === 0);
    if (salida[salida.length - 1] !== filas[filas.length - 1]) salida.push(filas[filas.length - 1]);
    return salida;
  }

  function opcionesBase(tituloY, log, color, animar) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: animar ? { duration: 220 } : false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", align: "end", labels: { color: color("--texto-2"), usePointStyle: true, boxWidth: 8, boxHeight: 8, sort: (a, b) => a.datasetIndex - b.datasetIndex } },
        tooltip: {
          callbacks: {
            title: (items) => `t = ${items[0].parsed.x.toFixed(3)} h`,
            label: (ctx) => `${ctx.dataset.label}: ${log ? ctx.parsed.y.toExponential(3) : ctx.parsed.y.toFixed(5)} mg/L`,
          },
        },
      },
      scales: {
        x: { type: "linear", title: { display: true, text: "t [h]", color: color("--texto-2") }, grid: { color: color("--rejilla") }, ticks: { color: color("--texto-2") } },
        y: {
          type: log ? "logarithmic" : "linear",
          title: { display: true, text: tituloY, color: color("--texto-2") },
          grid: { color: color("--rejilla") },
          ticks: { color: color("--texto-2"), maxTicksLimit: 8, callback: log ? (v) => (Number.isInteger(Math.log10(v)) ? `1e${Math.log10(v)}` : "") : undefined },
        },
      },
    };
  }

  function serie(etiqueta, datos, variable, color, extra) {
    return { label: etiqueta, data: datos, borderColor: color(variable), backgroundColor: color(variable), borderWidth: 2, pointRadius: datos.length <= 60 ? 3 : 0, pointHoverRadius: 5, tension: 0, ...extra };
  }

  function lectorColor(raiz) {
    const estilos = getComputedStyle(raiz || document.documentElement);
    return (variable) => estilos.getPropertyValue(variable).trim();
  }

  /** Dibuja C(t) en un lienzo; `raiz` indica de dónde leer los colores. */
  function dibujarConcentracion(lienzo, p, filas, { raiz, animar = true } = {}) {
    const color = lectorColor(raiz);
    const muestra = submuestrear(filas);
    const curva = (clave) => muestra.map((f) => ({ x: f.t, y: f[clave] }));
    const datos = [
      serie("Analítica", curva("analitica"), "--serie-analitica", color, { borderDash: [6, 4], pointRadius: 0, order: 3 }),
      serie("Heun", curva("heun"), "--serie-heun", color, { order: 2 }),
      serie("RK4", curva("rk4"), "--serie-rk4", color, { order: 1 }),
      serie(`Umbral ${p.cSegura} mg/L`, [{ x: 0, y: p.cSegura }, { x: p.tFinal, y: p.cSegura }], "--texto-2", color, { borderWidth: 1, borderDash: [2, 3], pointRadius: 0 }),
    ];
    return new Chart(lienzo, { type: "line", data: { datasets: datos }, options: opcionesBase("C [mg/L]", false, color, animar) });
  }

  function pintarGraficos(p, filas) {
    for (const g of graficos.values()) g.destroy();
    graficos.clear();
    graficos.set("c", dibujarConcentracion($("grafico-concentracion"), p, filas));
    const color = lectorColor();
    const muestra = submuestrear(filas);
    const errores = (clave) => muestra.filter((f) => f.t > 0 && f[clave] > 0 && Number.isFinite(f[clave])).map((f) => ({ x: f.t, y: f[clave] }));
    graficos.set("e", new Chart($("grafico-error"), {
      type: "line",
      data: { datasets: [serie("Heun", errores("errAbsHeun"), "--serie-heun", color), serie("RK4", errores("errAbsRk4"), "--serie-rk4", color)] },
      options: opcionesBase("Error absoluto [mg/L]", true, color, true),
    }));
  }

  function pintarIndicadores(p, res) {
    const yaSegura = p.c0 <= p.cSegura;
    $("cifra-tiempo").textContent = yaSegura ? "0 h" : `${res.tExacto.toFixed(2)} h`;
    $("cifra-nota").textContent = yaSegura
      ? `C₀ ya cumple el objetivo de ${p.cSegura} mg/L.`
      : `≈ ${aHorasMinutos(res.tExacto)} según la solución exacta, hasta C ≤ ${p.cSegura} mg/L.`;
    const cruce = (t) => (t === null ? "No alcanza" : `${t.toFixed(4)} h`);
    $("ind-heun").textContent = cruce(res.cruceHeun);
    $("ind-rk4").textContent = cruce(res.cruceRk4);
    $("ind-err-heun").textContent = `${fmtExp(res.errMaxHeun)} mg/L`;
    $("ind-err-rk4").textContent = `${fmtExp(res.errMaxRk4)} mg/L`;
  }

  function pintarInterpretacion(a) {
    $("interpretacion").replaceChildren(...a.interpretacion.map((texto) => {
      const nodo = document.createElement("p");
      nodo.textContent = texto;
      return nodo;
    }));
    const aviso = $("aviso-estabilidad");
    aviso.hidden = !a.aviso;
    aviso.textContent = a.aviso || "";
  }

  function celdas(fila, valores) {
    for (const v of valores) {
      const td = document.createElement("td");
      td.textContent = v;
      fila.append(td);
    }
  }

  function pintarComparacion(comparacion) {
    document.querySelector("#tabla-comparacion tbody").replaceChildren(...comparacion.map((c) => {
      const fila = document.createElement("tr");
      celdas(fila, [c.h, c.pasos, fmtExp(c.errMaxHeun), fmtExp(c.errMaxRk4), fmtExp(c.errRelFinalHeun), fmtExp(c.errRelFinalRk4), fmt(c.cruceHeun, 5), fmt(c.cruceRk4, 5)]);
      return fila;
    }));
  }

  const indiceCruce = (filas, umbral) => filas.findIndex((f) => f.analitica <= umbral);

  function pintarPagina() {
    const { filas, pagina, parametros } = estado;
    const paginas = Math.max(1, Math.ceil(filas.length / FILAS_POR_PAGINA));
    const inicio = pagina * FILAS_POR_PAGINA;
    const cruce = indiceCruce(filas, parametros.cSegura);
    const fragmento = document.createDocumentFragment();
    filas.slice(inicio, inicio + FILAS_POR_PAGINA).forEach((f, i) => {
      const fila = document.createElement("tr");
      if (inicio + i === cruce) {
        fila.className = "fila-cruce";
        fila.title = "Primer nodo con C exacta en o bajo el umbral seguro";
      }
      celdas(fila, [fmt(f.t, 3), fmt(f.analitica, 6), fmt(f.heun, 6), fmt(f.rk4, 6), fmtExp(f.errAbsHeun), fmtExp(f.errAbsRk4), fmtExp(f.errRelHeun), fmtExp(f.errRelRk4)]);
      fragmento.append(fila);
    });
    document.querySelector("#tabla-pasos tbody").replaceChildren(fragmento);
    $("pagina-info").textContent = `Filas ${inicio + 1}–${Math.min(inicio + FILAS_POR_PAGINA, filas.length)} de ${filas.length} · página ${pagina + 1}/${paginas}`;
    $("pagina-anterior").disabled = pagina === 0;
    $("pagina-siguiente").disabled = pagina >= paginas - 1;
  }

  function descargar(nombre, contenido, tipo) {
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    enlace.download = nombre;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  }

  function tablaCsv(filas) {
    const cabecera = "t_h,C_exacta_mg_L,C_heun_mg_L,C_rk4_mg_L,err_abs_heun,err_abs_rk4,err_rel_pct_heun,err_rel_pct_rk4";
    return [cabecera, ...filas.map((f) => [f.t, f.analitica, f.heun, f.rk4, f.errAbsHeun, f.errAbsRk4, f.errRelHeun, f.errRelRk4].join(","))].join("\n");
  }

  function sincronizarK(origen) {
    const k = $("k");
    if (origen === "k") {
      const valor = N.leerNumero(k.value);
      const volumen = N.leerNumero($("volumen").value);
      if (valor > 0 && volumen > 0) $("caudal").value = redondear(valor * volumen);
      return;
    }
    const { volumen, caudal } = leerParametros();
    if (volumen > 0 && caudal > 0) k.value = redondear(N.tasaDilucion(caudal, volumen));
  }

  function actualizar() {
    const entrada = leerParametros();
    const p = B.completarParametros(entrada);
    const errores = N.validar(p);
    if (!(N.leerNumero($("k").value) > 0) && !errores.caudal && !errores.volumen) {
      errores.k = "k debe ser un número mayor que 0 h⁻¹.";
    }
    mostrarErrores(errores);
    const valido = Object.keys(errores).length === 0;
    estado.parametros = valido ? entrada : null;
    $("generar-reporte").disabled = !valido;
    if (!valido) return;

    const a = B.analizar(entrada);
    estado.parametros = entrada;
    estado.filas = a.filas;
    const cruce = indiceCruce(a.filas, p.cSegura);
    estado.pagina = cruce > 0 ? Math.floor(cruce / FILAS_POR_PAGINA) : 0;

    pintarIndicadores(p, a.resultados);
    pintarGraficos(p, a.filas);
    pintarInterpretacion(a);
    pintarComparacion(a.comparacion);
    pintarPagina();
    document.querySelectorAll("#pastillas-h button").forEach((b) => b.classList.toggle("activa", parseFloat(b.dataset.h) === p.h));
  }

  /** Coloca parámetros en los campos, por ejemplo al recuperar un reporte. */
  function cargarParametros(valores) {
    for (const campo of CAMPOS) $(campo).value = valores[campo];
    sincronizarK("caudal");
    actualizar();
  }

  function enlazar() {
    for (const campo of CAMPOS) {
      $(campo).addEventListener("input", () => {
        if (campo === "volumen" || campo === "caudal") sincronizarK(campo);
        actualizar();
      });
    }
    $("k").addEventListener("input", () => { sincronizarK("k"); actualizar(); });
    $("pastillas-h").addEventListener("click", (e) => {
      if (e.target.dataset.h) { $("h").value = e.target.dataset.h; actualizar(); }
    });
    $("restablecer").addEventListener("click", () => cargarParametros(CASO_BASE));
    $("formulario").addEventListener("submit", (e) => e.preventDefault());
    $("descargar-csv").addEventListener("click", () => descargar(`reservorio_h_${estado.parametros ? estado.parametros.h : "paso"}.csv`, tablaCsv(estado.filas), "text/csv"));
    $("pagina-anterior").addEventListener("click", () => { estado.pagina -= 1; pintarPagina(); });
    $("pagina-siguiente").addEventListener("click", () => { estado.pagina += 1; pintarPagina(); });
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", actualizar);
  }

  window.Simulador = {
    cargarParametros,
    dibujarConcentracion,
    descargar,
    tablaCsv,
    parametrosActuales: () => estado.parametros,
  };

  enlazar();
  cargarParametros(CASO_BASE);
})();
