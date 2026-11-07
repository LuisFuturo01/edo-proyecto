#!/usr/bin/env node
/**
 * Interfaz de línea de comandos del simulador; sólo usa módulos propios de Node.js.
 *
 * Ejemplos:
 *   node src/simular.js
 *   node src/simular.js --c0 80 --k 0.2 --t-final 40 --paso 1 --paso 0.25
 *   node src/simular.js --reporte bitacora.json --titulo "Ensayo A"
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");
const N = require("../static/js/numerics.js");
const Bitacora = require("../static/js/bitacora.js");

const SALIDA_DEFECTO = path.resolve(__dirname, "..", "resultados");
const PASOS_CONVERGENCIA = [2, 1, 0.5, 0.25, 0.125, 0.0625];

const OPCIONES = {
  c0: { type: "string", default: "50" },
  volumen: { type: "string", default: "1000" },
  caudal: { type: "string", default: "100" },
  k: { type: "string" },
  "c-segura": { type: "string", default: "5" },
  "t-final": { type: "string", default: "48" },
  paso: { type: "string", multiple: true },
  salida: { type: "string", default: SALIDA_DEFECTO },
  reporte: { type: "string" },
  titulo: { type: "string", default: "" },
  notas: { type: "string", default: "" },
  ayuda: { type: "boolean", default: false },
};

const AYUDA = `Uso: node src/simular.js [opciones]
  --c0 <mg/L>         Concentración inicial (50)
  --volumen <L>       Volumen del tanque (1000)
  --caudal <L/h>      Caudal de agua pura (100)
  --k <1/h>           Tasa de dilución; sustituye al caudal por k·V
  --c-segura <mg/L>   Concentración objetivo (5)
  --t-final <h>       Horizonte de simulación (48)
  --paso <h>          Paso a comparar; repetible (1 y 0.25)
  --salida <carpeta>  Carpeta de los CSV (resultados/)
  --reporte <archivo> Añade un reporte a una bitácora JSON importable en la web
  --titulo <texto>    Título del reporte
  --notas <texto>     Notas del reporte`;

const fmtExp = (v, ancho = 12) => (v === null || !Number.isFinite(v) ? "-" : v.toExponential(4)).padStart(ancho);
const fmtFijo = (v, decimales, ancho) => (v === null || !Number.isFinite(v) ? "-" : v.toFixed(decimales)).padStart(ancho);

function imprimirPasos(filas, h) {
  const cada = Math.max(1, Math.floor((filas.length - 1) / 12));
  console.log(`\nTabla paso a paso, h = ${h} h (se muestra un nodo de cada ${cada})`);
  console.log(["t [h]".padStart(8), ..."C exacta,C Heun,C RK4,E_abs Heun,E_abs RK4,E_% Heun,E_% RK4".split(",").map((c) => c.padStart(12))].join(" "));
  filas.forEach((f, i) => {
    if (i % cada === 0 || i === filas.length - 1) {
      console.log([fmtFijo(f.t, 3, 8), fmtFijo(f.analitica, 6, 12), fmtFijo(f.heun, 6, 12), fmtFijo(f.rk4, 6, 12), fmtExp(f.errAbsHeun), fmtExp(f.errAbsRk4), fmtExp(f.errRelHeun), fmtExp(f.errRelRk4)].join(" "));
    }
  });
}

function imprimirConvergencia(filas) {
  console.log("\nConvergencia: error máximo en la malla y orden observado");
  console.log(`${"h [h]".padStart(8)} ${"pasos".padStart(6)} ${"E_max Heun".padStart(12)} ${"p Heun".padStart(7)} ${"E_max RK4".padStart(12)} ${"p RK4".padStart(7)} ${"t* Heun".padStart(10)} ${"t* RK4".padStart(10)}`);
  for (const f of filas) {
    console.log([fmtFijo(f.h, 4, 8), String(f.pasos).padStart(6), fmtExp(f.errMaxHeun), fmtFijo(f.ordenHeun, 3, 7), fmtExp(f.errMaxRk4), fmtFijo(f.ordenRk4, 3, 7), fmtFijo(f.cruceHeun, 5, 10), fmtFijo(f.cruceRk4, 5, 10)].join(" "));
  }
}

function exportarCsv(ruta, filas) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const columnas = Object.keys(filas[0]);
  const lineas = filas.map((f) => columnas.map((c) => (f[c] === null ? "" : f[c])).join(","));
  fs.writeFileSync(ruta, [columnas.join(","), ...lineas].join("\n") + "\n", "utf8");
}

function anadirReporte(ruta, reporte) {
  const existentes = fs.existsSync(ruta) ? Bitacora.importar(fs.readFileSync(ruta, "utf8")).reportes : [];
  fs.writeFileSync(ruta, JSON.stringify(Bitacora.exportar([...existentes, reporte]), null, 2) + "\n", "utf8");
  console.log(`\nReporte añadido a ${ruta} (${existentes.length + 1} en total).`);
}

function main(argv) {
  const { values: v } = parseArgs({ args: argv, options: OPCIONES });
  if (v.ayuda) {
    console.log(AYUDA);
    return 0;
  }
  const volumen = N.leerNumero(v.volumen);
  const parametros = {
    volumen,
    caudal: v.k !== undefined ? N.leerNumero(v.k) * volumen : N.leerNumero(v.caudal),
    c0: N.leerNumero(v.c0),
    cSegura: N.leerNumero(v["c-segura"]),
    tFinal: N.leerNumero(v["t-final"]),
  };
  const pasos = (v.paso || ["1", "0.25"]).map(N.leerNumero);
  for (const h of pasos) {
    const errores = Object.values(N.validar(Bitacora.completarParametros({ ...parametros, h })));
    if (errores.length) {
      console.error(`Error: ${errores.join(" ")}`);
      return 2;
    }
  }

  const base = Bitacora.completarParametros({ ...parametros, h: pasos[0] });
  console.log(`Modelo: dC/dt = -k C, C(0) = ${base.c0} mg/L, k = ${base.k} 1/h, horizonte = ${base.tFinal} h`);
  console.log(`Residuo máximo por sustitución de C(t) en la EDO: ${N.residuoSustitucion(base.c0, base.k, base.tFinal).toExponential(3)} mg/(L h)`);
  console.log(`Tiempo exacto hasta C <= ${base.cSegura} mg/L: t* = ${N.tiempoExacto(base.c0, base.k, base.cSegura).toFixed(6)} h`);

  for (const h of pasos) {
    const { filas } = N.simular({ ...base, h });
    imprimirPasos(filas, h);
    exportarCsv(path.join(v.salida, `tabla_h_${h}.csv`), filas);
  }
  const estudio = N.convergencia(base, PASOS_CONVERGENCIA.filter((h) => h <= base.tFinal && base.tFinal / h <= N.MAX_PASOS));
  imprimirConvergencia(estudio);
  exportarCsv(path.join(v.salida, "convergencia.csv"), estudio);
  console.log(`\nCSV exportados en: ${v.salida}`);

  if (v.reporte) {
    anadirReporte(v.reporte, Bitacora.crearReporte({ ...parametros, h: pasos[0] }, { titulo: v.titulo, notas: v.notas }));
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 2;
  }
}

module.exports = { main };
