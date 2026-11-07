"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../static/js/bitacora.js");

const BASE = { volumen: 1000, caudal: 100, c0: 50, cSegura: 5, tFinal: 48, h: 1 };
const reporte = (datos, p = BASE) => B.crearReporte(p, datos);
const archivo = (reportes) => JSON.stringify(B.exportar(reportes));
const copia = (o) => JSON.parse(JSON.stringify(o));

test("un reporte responde la pregunta y conserva sus datos", () => {
  const r = reporte({ titulo: "  Ensayo  ", notas: "Tanque norte" });
  assert.equal(r.titulo, "Ensayo");
  assert.equal(r.notas, "Tanque norte");
  assert.ok(Math.abs(r.resultados.tExacto - 23.02585) < 1e-4);
  assert.equal(r.resultados.k, 0.1);
  assert.deepEqual(r.comparacion.map((c) => c.h), [1, 0.25]);
  assert.match(r.interpretacion[0], /23\.03 h/);
  assert.match(r.interpretacion.at(-1), /RK4/);
  assert.equal(r.aviso, null);
  assert.deepEqual(copia(r), r, "el reporte debe sobrevivir a JSON sin cambios");
});

test("título predeterminado y paso adicional en la comparación", () => {
  const r = reporte({}, { ...BASE, h: 0.5 });
  assert.match(r.titulo, /h = 0.5 h/);
  assert.deepEqual(r.comparacion.map((c) => c.h), [1, 0.5, 0.25]);
});

test("casos especiales de la interpretación", () => {
  assert.match(reporte({}, { ...BASE, c0: 4 }).interpretacion[0], /no hace falta diluir/);
  assert.match(reporte({}, { ...BASE, tFinal: 10 }).interpretacion[0], /no llega a la meta/);
  assert.match(reporte({}, { ...BASE, caudal: 1000, h: 3 }).aviso, /inestable a Heun y RK4/);
});

test("paso inestable con desbordamiento: el reporte sigue siendo JSON válido e importable", () => {
  const r = reporte({}, { volumen: 1, caudal: 100, c0: 50, cSegura: 5, tFinal: 2000, h: 5 });
  assert.equal(r.resultados.errMaxHeun, null);
  const salida = B.importar(archivo([r]));
  assert.equal(salida.agregados, 1);
});

test("exportar e importar recupera exactamente los reportes", () => {
  const a = reporte({ titulo: "A", fecha: "2026-11-01T10:00:00.000Z" });
  const b = reporte({ titulo: "B", fecha: "2026-11-02T10:00:00.000Z" }, { ...BASE, h: 0.25 });
  const salida = B.importar(archivo([a, b]));
  assert.equal(salida.agregados, 2);
  assert.deepEqual(salida.reportes, [b, a]);
});

test("importar combina sin duplicar y conserva la versión local", () => {
  const a = reporte({ titulo: "Local" });
  const externo = { ...copia(a), titulo: "Editado fuera" };
  const b = reporte({ titulo: "Nuevo" }, { ...BASE, c0: 80 });
  const salida = B.importar(archivo([externo, b]), [a]);
  assert.equal(salida.agregados, 1);
  assert.equal(salida.duplicados, 1);
  assert.equal(salida.reportes.find((r) => r.id === a.id).titulo, "Local");
});

test("rechaza resultados alterados y conserva los válidos", () => {
  const bueno = reporte({ titulo: "Bueno" });
  const alterado = copia(reporte({ titulo: "Alterado" }));
  alterado.resultados.tExacto = 1;
  const salida = B.importar(archivo([bueno, alterado]));
  assert.equal(salida.agregados, 1);
  assert.equal(salida.rechazados.length, 1);
  assert.match(salida.rechazados[0].motivo, /no coinciden/);
});

test("reemplaza la interpretación importada por la recalculada y descarta campos ajenos", () => {
  const r = copia(reporte({}));
  r.interpretacion = ["<img src=x onerror=alert(1)>"];
  r.ajeno = "x";
  const [limpio] = B.importar(archivo([r])).reportes;
  assert.doesNotMatch(limpio.interpretacion.join(" "), /onerror/);
  assert.equal(limpio.ajeno, undefined);
});

test("rechaza reportes con estructura o parámetros inválidos", () => {
  const casos = [
    [null, /no es un reporte/],
    [{ ...copia(reporte({})), id: "../x" }, /identificador/],
    [{ ...copia(reporte({})), fecha: "ayer" }, /fecha/],
    [{ ...copia(reporte({})), titulo: 5 }, /título/],
    [{ ...copia(reporte({})), parametros: { ...BASE, c0: "50" } }, /c0/],
    [{ ...copia(reporte({})), parametros: { ...BASE, h: -1 } }, /paso h/],
    [{ ...copia(reporte({})), resultados: null }, /sin resultados/],
  ];
  for (const [crudo, motivo] of casos) {
    const v = B.validarReporte(crudo);
    assert.equal(v.ok, false);
    assert.match(v.motivo, motivo);
  }
});

test("rechaza archivos que no son una bitácora", () => {
  assert.throws(() => B.importar("{no json"), /JSON/);
  assert.throws(() => B.importar("null"), /no es una bitácora/);
  assert.throws(() => B.importar('{"formato":"otro"}'), /no es una bitácora/);
  assert.throws(() => B.importar(JSON.stringify({ formato: B.FORMATO, version: 99, reportes: [] })), /Versión/);
  assert.throws(() => B.importar(JSON.stringify({ formato: B.FORMATO, version: B.VERSION })), /lista/);
});
