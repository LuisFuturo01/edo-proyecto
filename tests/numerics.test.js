"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../static/js/numerics.js");

const K = 0.1;
const F = (c) => -K * c;
const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, msg || `${a} no está a ${tol} de ${b}`);
const BASE = { c0: 50, k: K, cSegura: 5, tFinal: 48 };

test("lectura de números escritos por teclado", () => {
  assert.equal(N.leerNumero("0,25"), 0.25);
  assert.equal(N.leerNumero(" 1e-3 "), 0.001);
  for (const malo of ["", "abc", "1,2,3", "1 2", "--1", "0x10", null]) assert.ok(Number.isNaN(N.leerNumero(malo)), String(malo));
});

test("solución analítica: condición inicial y sustitución en la EDO", () => {
  assert.equal(N.analitica(0, 50, K), 50);
  assert.ok(N.residuoSustitucion(50, K, 48) < 1e-8);
});

test("tiempo exacto de la pregunta comunitaria", () => {
  cerca(N.tiempoExacto(50, K, 5), 10 * Math.log(10), 1e-12);
  cerca(N.analitica(N.tiempoExacto(50, K, 5), 50, K), 5, 1e-12);
  assert.equal(N.tiempoExacto(4, K, 5), 0);
  cerca(N.tasaDilucion(100, 1000), 0.1, 1e-15);
});

test("primer paso a mano de Heun y RK4", () => {
  cerca(N.pasoHeun(F, 50, 1), 45.25, 1e-12);
  cerca(N.pasoRk4(F, 50, 1), 45.241875, 1e-12);
});

test("los pasos coinciden con los factores de amplificación exactos", () => {
  for (const h of [1, 0.25, 0.1]) {
    const a = N.amplificacion(K, h);
    cerca(N.pasoHeun(F, 50, h), 50 * a.heun, 1e-12);
    cerca(N.pasoRk4(F, 50, h), 50 * a.rk4, 1e-12);
  }
});

test("malla: último paso recortado y sin paso residual", () => {
  const m = N.malla(1, 0.3);
  assert.equal(m.length, 5);
  assert.equal(m[4], 1);
  assert.equal(N.malla(48, 0.25).length, 193);
});

test("primer cruce con interpolación lineal", () => {
  assert.equal(N.primerCruce([0, 1, 2], [10, 6, 2], 4), 1.5);
  assert.equal(N.primerCruce([0, 1], [10, 6], 4), null);
  assert.equal(N.primerCruce([0, 1], [3, 2], 4), 0);
});

test("errores nulos en el nodo inicial y relativo sin división por cero", () => {
  const f = N.simular({ ...BASE, h: 1 }).filas[0];
  assert.equal(f.errAbsHeun, 0);
  assert.equal(f.errRelRk4, 0);
  const lejos = N.simular({ c0: 1, k: 10, cSegura: 0.5, tFinal: 1000, h: 1 }).filas.at(-1);
  assert.equal(lejos.errRelHeun, null);
});

test("cifras de referencia del caso base", () => {
  const [h1, h025] = N.convergencia(BASE, [1, 0.25]);
  cerca(h1.errMaxHeun, 3.3077e-2, 1e-6);
  cerca(h1.errMaxRk4, 1.6662e-5, 1e-9);
  cerca(h025.errMaxHeun, 1.9524e-3, 1e-7);
  cerca(h025.errMaxRk4, 6.1137e-8, 1e-11);
  // De h = 1 a h = 0.25, el error de Heun cae ~4^2 y el de RK4 ~4^4.
  cerca(h1.errMaxHeun / h025.errMaxHeun, 16, 1.3);
  cerca(h1.errMaxRk4 / h025.errMaxRk4, 256, 20);
});

test("el orden observado de RK4 supera al de Heun y tiende a 4 y 2", () => {
  const filas = N.convergencia(BASE, [2, 1, 0.5, 0.25, 0.125]);
  assert.equal(filas[0].ordenHeun, null);
  for (const f of filas.slice(1)) {
    cerca(f.ordenHeun, 2, 0.15);
    cerca(f.ordenRk4, 4, 0.15);
    assert.ok(f.ordenRk4 > f.ordenHeun + 1.5);
    assert.ok(f.errMaxRk4 < f.errMaxHeun);
  }
  cerca(filas.at(-1).ordenHeun, 2, 0.02);
  cerca(filas.at(-1).ordenRk4, 4, 0.02);
});

test("el tiempo al umbral de cada método se acerca al exacto", () => {
  const f = N.convergencia(BASE, [0.125])[0];
  cerca(f.cruceHeun, 10 * Math.log(10), 2e-3);
  cerca(f.cruceRk4, 10 * Math.log(10), 2e-3);
});

test("validación de entradas", () => {
  assert.deepEqual(N.validar({ ...BASE, h: 1 }), {});
  assert.ok(N.validar({ ...BASE, h: 100 }).h);
  assert.ok(N.validar({ ...BASE, h: 0.001 }).h);
  assert.ok(N.validar({ ...BASE, h: NaN }).h);
  assert.ok(N.validar({ ...BASE, c0: 0, h: 1 }).c0);
  const conTanque = N.validar({ ...BASE, h: 1, volumen: -1, caudal: 100, k: -100 });
  assert.ok(conTanque.volumen);
  assert.equal(conTanque.k, undefined);
});
