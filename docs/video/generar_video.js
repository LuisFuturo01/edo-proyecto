/**
 * Graba la demostración de 3 minutos manejando la aplicación real en Chrome sin ventana.
 * Produce un MP4 con subtítulos incrustados y un archivo .srt.
 *
 * Es una herramienta de producción y no forma parte de la aplicación. Requiere Chrome y,
 * en una carpeta aparte: npm i puppeteer-core ffmpeg-static
 *
 * Uso: node generar_video.js [carpeta de salida]
 * Variables: VIDEO_CHROME (ruta de Chrome), VIDEO_PROYECTO (raíz del proyecto).
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const puppeteer = require("puppeteer-core");
const ffmpeg = require("ffmpeg-static");

const PROYECTO = process.env.VIDEO_PROYECTO || path.resolve(__dirname, "..", "..");
const SALIDA = path.resolve(process.argv[2] || __dirname);
const CHROME = process.env.VIDEO_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const NOMBRE = "demo_agua_segura_3min";
const { crearServidor } = require(path.join(PROYECTO, "src", "servidor.js"));
const N = require(path.join(PROYECTO, "static", "js", "numerics.js"));

const FPS = 30;
const TOTAL_S = 180;
const CARACTERES_POR_SEGUNDO = Number(process.env.VIDEO_CPS || 17);
const MARGEN_INFERIOR = 610;
const LECTURA_MINIMA_S = 2.4;

let pagina;
let codificador;
let cuadros = 0;
let cursor = { x: 640, y: 360 };
const cues = [];
let cueAbierto = null;

const ahora = () => cuadros / FPS;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const suavizar = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function escribirCuadro(buffer) {
  cuadros += 1;
  return codificador.stdin.write(buffer) ? null : new Promise((r) => codificador.stdin.once("drain", r));
}

async function capturar() {
  await pagina.evaluate(() => window.__rec.sincronizar());
  return pagina.screenshot({ type: "jpeg", quality: 92, optimizeForSpeed: true });
}

async function sostener(segundos) {
  const n = Math.round(segundos * FPS);
  if (n <= 0) return;
  const imagen = await capturar();
  for (let i = 0; i < n; i++) await escribirCuadro(imagen);
}

async function animar(segundos, paso) {
  const n = Math.max(1, Math.round(segundos * FPS));
  for (let i = 1; i <= n; i++) {
    await paso(suavizar(i / n));
    await escribirCuadro(await capturar());
  }
}

/* ---------- Capa de grabación: subtítulo, cursor, resaltado y tarjetas ---------- */
function instalarCapa() {
  const estilos = document.createElement("style");
  estilos.textContent = `
    #rec { position: fixed; inset: 0; width: 100vw; height: 100vh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; background: transparent; overflow: hidden; pointer-events: none; font-family: "Segoe UI", system-ui, sans-serif; }
    #rec-sub { position: absolute; left: 50%; bottom: 20px; transform: translateX(-50%); width: max-content; max-width: 1040px; padding: 11px 22px; color: #fff; font-size: 23px; font-weight: 500; line-height: 1.34; text-align: center; background: rgb(8 24 32 / 92%); border-radius: 12px; box-shadow: 0 6px 22px rgb(0 0 0 / 35%); }
    #rec-sub:empty { display: none; }
    #rec-sub b { color: #ffd166; font-weight: 700; }
    #rec-capitulo { position: absolute; top: 12px; right: 16px; padding: 5px 13px; color: #fff; font-size: 14px; font-weight: 600; background: rgb(11 110 138 / 95%); border-radius: 999px; }
    #rec-capitulo:empty { display: none; }
    #rec-anillo { position: absolute; display: none; border: 3px solid #f59e0b; border-radius: 10px; box-shadow: 0 0 0 4px rgb(245 158 11 / 25%); }
    #rec-cursor { position: absolute; width: 24px; height: 24px; left: 0; top: 0; filter: drop-shadow(0 2px 3px rgb(0 0 0 / 50%)); }
    #rec-pulso { position: absolute; width: 34px; height: 34px; margin: -17px 0 0 -17px; display: none; background: rgb(245 158 11 / 45%); border-radius: 50%; }
    #rec-tarjeta { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; padding: 0 90px 70px; color: #fff; text-align: center; background: linear-gradient(120deg, #0a3a4a, #0b6e8a); }
    #rec-tarjeta small { font-size: 18px; letter-spacing: .1em; text-transform: uppercase; opacity: .85; }
    #rec-tarjeta h1 { margin: 14px 0; font-size: 50px; line-height: 1.15; }
    #rec-tarjeta p { margin: 0; max-width: 900px; font-size: 24px; line-height: 1.4; color: #d9eef4; }
  `;
  document.head.append(estilos);
  const capa = document.createElement("div");
  capa.id = "rec";
  capa.popover = "manual";
  capa.innerHTML = `<div id="rec-tarjeta"></div><div id="rec-anillo"></div><div id="rec-capitulo"></div><div id="rec-sub"></div><div id="rec-pulso"></div>
    <svg id="rec-cursor" viewBox="0 0 24 24"><path d="M4 2l15 11.5-6.6.9 3.9 7.3-3 1.5-3.8-7.4L5 20z" fill="#fff" stroke="#111" stroke-width="1.4"/></svg>`;
  document.body.append(capa);
  capa.showPopover();
  let objetivo = null;
  window.__rec = {
    alFrente() { capa.hidePopover(); capa.showPopover(); },
    subtitulo(texto) {
      const nodo = document.getElementById("rec-sub");
      nodo.replaceChildren(...texto.split("**").map((parte, i) => {
        if (i % 2 === 0) return document.createTextNode(parte);
        const b = document.createElement("b");
        b.textContent = parte;
        return b;
      }));
    },
    capitulo(texto) { document.getElementById("rec-capitulo").textContent = texto; },
    tarjeta(datos) {
      const nodo = document.getElementById("rec-tarjeta");
      nodo.style.display = datos ? "flex" : "none";
      nodo.replaceChildren();
      if (!datos) return;
      for (const [etiqueta, texto] of [["small", datos.sobre], ["h1", datos.titulo], ["p", datos.bajada]]) {
        const hijo = document.createElement(etiqueta);
        hijo.textContent = texto;
        nodo.append(hijo);
      }
    },
    resaltar(selector) { objetivo = selector; },
    cursor(x, y, visible = true) {
      const nodo = document.getElementById("rec-cursor");
      nodo.style.transform = `translate(${x}px, ${y}px)`;
      nodo.style.display = visible ? "block" : "none";
    },
    pulso(x, y) {
      const nodo = document.getElementById("rec-pulso");
      nodo.style.display = x === null ? "none" : "block";
      if (x !== null) { nodo.style.left = `${x}px`; nodo.style.top = `${y}px`; }
    },
    sincronizar() {
      const anillo = document.getElementById("rec-anillo");
      const nodo = objetivo && document.querySelector(objetivo);
      anillo.style.display = nodo ? "block" : "none";
      if (nodo) {
        const r = nodo.getBoundingClientRect();
        Object.assign(anillo.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
      }
    },
  };
}

const capa = (metodo, ...args) => pagina.evaluate((m, a) => window.__rec[m](...a), metodo, args);

/* ---------- Guion: subtítulos, capítulos y acciones ---------- */
let minimoLectura = 0;

async function esperarLectura() {
  if (ahora() < minimoLectura) await sostener(minimoLectura - ahora());
}

function cerrarCue() {
  if (cueAbierto) {
    cueAbierto.fin = ahora();
    cues.push(cueAbierto);
    cueAbierto = null;
  }
}

async function decir(texto) {
  await esperarLectura();
  cerrarCue();
  await capa("subtitulo", texto);
  cueAbierto = { inicio: ahora(), texto: texto.replaceAll("**", "") };
  minimoLectura = ahora() + Math.max(LECTURA_MINIMA_S, texto.replaceAll("**", "").length / CARACTERES_POR_SEGUNDO);
}

async function escena(nombre, accion) {
  const inicio = ahora();
  await capa("capitulo", nombre);
  await accion();
  await esperarLectura();
  console.log(`${nombre}: ${(ahora() - inicio).toFixed(1)} s, acumulado ${ahora().toFixed(1)} s`);
}

async function mover(x, y, segundos = 0.5) {
  const origen = { ...cursor };
  await animar(segundos, async (t) => {
    cursor = { x: origen.x + (x - origen.x) * t, y: origen.y + (y - origen.y) * t };
    await capa("cursor", cursor.x, cursor.y);
    await pagina.mouse.move(cursor.x, cursor.y);
  });
}

async function centro(selector) {
  return pagina.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, selector);
}

async function irA(selector, margenSuperior = 16, segundos = 0.9) {
  const destino = await pagina.evaluate((s, m) => window.scrollY + document.querySelector(s).getBoundingClientRect().top - m, selector, margenSuperior);
  const origen = await pagina.evaluate(() => window.scrollY);
  await animar(segundos, (t) => pagina.evaluate((y) => window.scrollTo(0, y), origen + (destino - origen) * t));
}

async function desplazarDentro(selector, destino, segundos = 1) {
  const origen = await pagina.evaluate((s) => document.querySelector(s).scrollTop, selector);
  await animar(segundos, (t) => pagina.evaluate((s, y) => { document.querySelector(s).scrollTop = y; }, selector, origen + (destino - origen) * t));
}

/** Desplaza la página si el elemento queda fuera de la zona no cubierta por el subtítulo. */
async function asegurarVisible(selector) {
  const r = await pagina.evaluate((s) => {
    const n = document.querySelector(s);
    const caja = n.getBoundingClientRect();
    return { arriba: caja.top, abajo: caja.bottom, enDialogo: Boolean(n.closest("dialog")) };
  }, selector);
  if (r.enDialogo || (r.arriba >= 20 && r.abajo <= MARGEN_INFERIOR)) return;
  await irA(selector, 260, 0.5);
}

async function clic(selector, opciones = {}) {
  await asegurarVisible(selector);
  const c = await centro(selector);
  await mover(c.x, c.y, opciones.segundos ?? 0.45);
  await capa("pulso", c.x, c.y);
  await sostener(0.12);
  await pagina.mouse.click(c.x, c.y, { clickCount: opciones.veces ?? 1 });
  await dormir(opciones.espera ?? 330);
  await capa("pulso", null, null);
  await sostener(0.15);
}

/** Reemplaza el contenido de un campo tecleando carácter por carácter. */
async function teclear(selector, texto, { ritmo = 0.13, espera = 270 } = {}) {
  await clic(selector, { veces: 3, espera: 60 });
  for (const caracter of texto) {
    await pagina.keyboard.type(caracter);
    await dormir(espera);
    await sostener(ritmo);
  }
}

async function comprobarTexto(selector, esperado) {
  const real = await pagina.$eval(selector, (n) => n.textContent.trim());
  if (!real.includes(esperado)) throw new Error(`${selector}: se esperaba «${esperado}» y hay «${real}»`);
}

const horas = (c0, k, cs) => `${N.tiempoExacto(c0, k, cs).toFixed(2)} h`;

/* ---------- Escenas ---------- */
async function guion(carpetaDescargas) {
  const base = await N.convergencia({ c0: 50, k: 0.1, cSegura: 5, tFinal: 48 }, [1, 0.25]);
  const [h1, h025] = base;
  const razonHeun = Math.round(h1.errMaxHeun / h025.errMaxHeun);
  const razonRk4 = Math.round(h1.errMaxRk4 / h025.errMaxRk4);

  await capa("cursor", cursor.x, cursor.y, false);
  await capa("tarjeta", { sobre: "Métodos Numéricos · Desafío EDO", titulo: "Agua Segura", bajada: "Simulador de la purificación de un reservorio comunitario con Heun, RK4 y solución analítica" });
  await escena("", async () => {
    await decir("¿En cuántas horas vuelve a ser segura el agua de un tanque contaminado? Veamos cómo lo resuelve esta página.");
  });
  await capa("tarjeta", null);
  await capa("cursor", cursor.x, cursor.y, true);

  await escena("1 · El problema", async () => {
    await decir("Una comunidad rural depende de un tanque de **1000 L** contaminado con **50 mg/L**. Los datos son hipotéticos.");
    await decir("Entra agua pura a **100 L/h** y sale la mezcla al mismo caudal. La meta es llegar a **5 mg/L** o menos.");
    await capa("resaltar", ".resultado");
    await decir("La respuesta aparece arriba: **23.03 h**, unas 23 horas y 2 minutos, según la solución exacta.");
    await comprobarTexto("#cifra-tiempo", "23.03 h");
    await capa("resaltar", ".indicadores");
    await decir("Al lado, lo que estiman Heun y RK4, y el error de cada uno.");
    await esperarLectura();
    await capa("resaltar", null);
  });

  await escena("2 · El modelo", async () => {
    await irA("#titulo-modelo", 20);
    await decir("Todo sale de un balance de masa: el contaminante sólo abandona el tanque con el agua que sale.");
    await capa("resaltar", ".demostracion");
    await decir("Eso da la EDO **dC/dt = −k·C**, con **k = Q/V = 0.1 h⁻¹** y condición inicial C(0) = 50 mg/L.");
    await decir("Separando variables sale la solución exacta **C(t) = C₀·e^(−k·t)**, comprobada por sustitución.");
    await decir("Despejando el tiempo: **t* = ln(50/5) / 0.1 = 23.03 h**.");
    await esperarLectura();
    await capa("resaltar", null);
    await irA(".explicacion .dos-columnas:nth-of-type(2)", 110);
    await decir("Heun usa **dos pendientes** por paso y su error es proporcional a **h²**. RK4 usa **cuatro**, con error proporcional a **h⁴**.");
  });

  await escena("3 · Datos por teclado", async () => {
    await irA("#formulario");
    await decir("Todos los datos se escriben con el teclado, y los resultados se recalculan al instante.");
    await teclear("#c0", "80");
    await comprobarTexto("#cifra-tiempo", horas(80, 0.1, 5));
    await decir(`Si el tanque inicia en **80 mg/L**, el tiempo sube a **${horas(80, 0.1, 5)}**.`);
    await esperarLectura();
    await teclear("#caudal", "250,5");
    await comprobarTexto("#cifra-tiempo", horas(80, 0.2505, 5));
    await decir(`Con más caudal, 250,5 L/h, **k se actualiza solo** a 0.2505 h⁻¹ y bastan **${horas(80, 0.2505, 5)}**. Admite coma decimal.`);
    await esperarLectura();
    await teclear("#h", "abc", { espera: 120 });
    await comprobarTexto('[data-campo="h"] .error', "debe ser un número");
    await decir("Una entrada inválida no se calcula: la página explica el motivo y bloquea el reporte.");
    await esperarLectura();
    await clic("#restablecer");
    await comprobarTexto("#cifra-tiempo", "23.03 h");
    await decir("Volvemos al caso base para comparar los métodos.");
  });

  await escena("4 · Resultados", async () => {
    await irA(".columna-graficos", 16);
    await decir("El gráfico superpone la solución exacta, Heun y RK4. Aquí casi coinciden; el cursor permite leer cada valor.");
    const g = await centro("#grafico-concentracion");
    await mover(g.x - 40, g.y, 0.7);
    await esperarLectura();
    await irA("#titulo-error", 20);
    const e = await centro("#grafico-error");
    await mover(e.x, e.y + 20, 0.5);
    await decir(`El error sí los separa. Con h = 1 h, Heun llega a **${h1.errMaxHeun.toExponential(1)}** mg/L y RK4 a **${h1.errMaxRk4.toExponential(1)}**: unas 2000 veces menos.`);
    await esperarLectura();
    await irA("#titulo-comparacion", 20);
    await capa("resaltar", "#tabla-comparacion");
    await decir(`Al pasar de h = 1 a h = 0.25, el error de Heun cae **${razonHeun} veces** y el de RK4 **${razonRk4} veces**: confirma los órdenes 2 y 4.`);
    await esperarLectura();
    await capa("resaltar", null);
    await irA("#titulo-interpretacion", 20);
    await capa("resaltar", "#interpretacion");
    await decir("La interpretación automática responde en lenguaje sencillo: 23 h y unos **2303 L** de agua pura.");
    await esperarLectura();
    await capa("resaltar", null);
    await irA("#formulario");
    await teclear("#caudal", "2500");
    await comprobarTexto("#cifra-tiempo", horas(50, 2.5, 5));
    await irA(".columna-graficos", 16, 0.6);
    await decir("Con **k·h = 2.5**, Heun se vuelve inestable: ese crecimiento es un artefacto del cálculo, no del agua.");
    await esperarLectura();
  });

  await escena("5 · Reportes", async () => {
    await irA("#formulario", 16, 0.6);
    await clic("#restablecer", { segundos: 0.35 });
    await irA("#titulo-reporte", 300, 0.5);
    await decir("Cada ensayo se puede convertir en un reporte, con título y notas opcionales.");
    await teclear("#titulo-reporte", "Tanque norte, ensayo 1", { ritmo: 0.04, espera: 5 });
    await teclear("#notas-reporte", "Caso base con h = 1 h", { ritmo: 0.04, espera: 5 });
    await clic("#generar-reporte", { espera: 450 });
    await capa("alFrente");
    await decir("El reporte reúne los datos, el modelo, los resultados y la interpretación.");
    await esperarLectura();
    await desplazarDentro("#modal-reporte", 560, 1.3);
    await decir("También trae el gráfico, la comparación de pasos y la tabla con sus errores.");
    await esperarLectura();
    await desplazarDentro("#modal-reporte", 0, 0.5);
    await capa("resaltar", ".barra-reporte");
    await decir("Se puede imprimir, guardar como PDF o descargar en JSON y CSV.");
    await esperarLectura();
    await capa("resaltar", null);
    await clic("#reporte-cerrar", { segundos: 0.35 });
  });

  await escena("6 · Bitácora", async () => {
    await teclear("#h", "0.25", { ritmo: 0.08, espera: 150 });
    await irA("#titulo-reporte", 300, 0.4);
    await teclear("#titulo-reporte", "Tanque norte, ensayo 2", { ritmo: 0.03, espera: 5 });
    await clic("#generar-reporte", { espera: 400 });
    await capa("alFrente");
    await clic("#reporte-cerrar", { segundos: 0.3 });
    await irA("#titulo-bitacora", 20, 0.7);
    await decir("Cada reporte queda en la **caché del navegador**, formando una bitácora que se puede buscar.");
    await esperarLectura();
    await pagina.reload({ waitUntil: "networkidle0" });
    await pagina.evaluate(instalarCapa);
    await capa("capitulo", "6 · Bitácora");
    await pagina.evaluate(() => document.getElementById("titulo-bitacora").scrollIntoView());
    await pagina.evaluate(() => window.scrollBy(0, -20));
    await capa("cursor", cursor.x, cursor.y);
    await dormir(500);
    const filas = await pagina.$$eval("#lista-bitacora tr", (f) => f.length);
    if (filas !== 2) throw new Error(`Se esperaban 2 reportes tras recargar y hay ${filas}`);
    await decir("Recargamos la página y los **dos reportes siguen ahí**.");
    await esperarLectura();
    await clic("#exportar-bitacora");
    await decir("Con **Exportar JSON**, la bitácora se descarga para compartirla o respaldarla.");
    await esperarLectura();
    const archivo = await esperarDescarga(carpetaDescargas);
    await clic("#vaciar-bitacora");
    await comprobarTexto("#estado-bitacora", "vaciada");
    await decir("Si se vacía o se cambia de equipo, no se pierde nada...");
    await esperarLectura();
    const entrada = await pagina.$("#archivo-bitacora");
    await clic("#importar-bitacora", { espera: 50 });
    await entrada.uploadFile(archivo);
    await dormir(500);
    await comprobarTexto("#estado-bitacora", "Importados");
    await decir("...porque **Importar JSON** la recupera. Cada reporte se recalcula: las cifras alteradas se rechazan.");
    await capa("resaltar", "#contenedor-bitacora");
    await esperarLectura();
    await capa("resaltar", null);
  });

  await capa("cursor", cursor.x, cursor.y, false);
  await capa("capitulo", "");
  await capa("tarjeta", { sobre: "Conclusión", titulo: "23.03 h y RK4 con el menor error", bajada: "Simulación educativa con parámetros hipotéticos: declarar el agua potable exige un análisis de laboratorio." });
  const resto = TOTAL_S - ahora();
  await decir("RK4 tuvo el menor error en todos los ensayos. El modelo orienta la planificación, pero supone mezcla perfecta.");
  await esperarLectura();
  if (ahora() > TOTAL_S) throw new Error(`El guion dura ${ahora().toFixed(1)} s; reduzca texto o suba VIDEO_CPS.`);
  await sostener(TOTAL_S - ahora());
  cerrarCue();
  console.log(`Conclusión: ${resto.toFixed(1)} s`);
}

function descargaLista(carpeta) {
  return fs.readdirSync(carpeta).find((n) => n.endsWith(".json"));
}

async function esperarDescarga(carpeta) {
  for (let i = 0; i < 50; i++) {
    const nombre = descargaLista(carpeta);
    if (nombre) return path.join(carpeta, nombre);
    await dormir(100);
  }
  throw new Error("La exportación no generó un archivo.");
}

const tiempoSrt = (s) => {
  const ms = Math.round(s * 1000);
  const pad = (v, n = 2) => String(v).padStart(n, "0");
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};

async function main() {
  fs.mkdirSync(SALIDA, { recursive: true });
  const descargas = fs.mkdtempSync(path.join(os.tmpdir(), "video-edo-"));
  const servidor = crearServidor();
  await new Promise((listo) => servidor.listen(0, "127.0.0.1", listo));
  const mp4 = path.join(SALIDA, `${NOMBRE}.mp4`);
  codificador = spawn(ffmpeg, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], { stdio: ["pipe", "inherit", "inherit"] });
  const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1.5 } });
  try {
    pagina = await navegador.newPage();
    pagina.on("dialog", (d) => d.accept());
    pagina.on("pageerror", (e) => { throw e; });
    await pagina.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "reduce" }]);
    const cdp = await pagina.createCDPSession();
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: descargas });
    await pagina.goto(`http://127.0.0.1:${servidor.address().port}/app/`, { waitUntil: "networkidle0" });
    await pagina.evaluate(instalarCapa);
    await dormir(500);
    await guion(descargas);

    await pagina.evaluate(() => document.querySelector("#lista-bitacora [data-accion=ver]").click());
    await dormir(500);
    await pagina.pdf({ path: path.join(descargas, "prueba_impresion.pdf"), format: "A4", printBackground: true });
    fs.copyFileSync(path.join(descargas, "prueba_impresion.pdf"), path.join(process.env.VIDEO_PDF || os.tmpdir(), "prueba_impresion.pdf"));
  } finally {
    await navegador.close();
    servidor.close();
    codificador.stdin.end();
  }
  await new Promise((listo) => codificador.on("close", listo));
  const srt = cues.map((c, i) => `${i + 1}\n${tiempoSrt(c.inicio)} --> ${tiempoSrt(c.fin)}\n${c.texto}\n`).join("\n");
  fs.writeFileSync(path.join(SALIDA, `${NOMBRE}.srt`), srt, "utf8");
  console.log(`Listo: ${mp4}, ${cuadros} cuadros, ${(cuadros / FPS).toFixed(2)} s, ${cues.length} subtítulos`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
