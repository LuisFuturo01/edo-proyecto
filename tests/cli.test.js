"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { crearServidor } = require("../src/servidor.js");
const B = require("../static/js/bitacora.js");

const CLI = path.resolve(__dirname, "..", "src", "simular.js");
const correr = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

test("la CLI imprime tablas, exporta CSV y crea una bitácora importable", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "edo-"));
  const bitacora = path.join(dir, "b.json");
  const r = correr("--salida", dir, "--reporte", bitacora, "--titulo", "Desde Node");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /t\* = 23\.025851 h/);
  assert.ok(fs.existsSync(path.join(dir, "tabla_h_0.25.csv")));
  assert.match(fs.readFileSync(path.join(dir, "convergencia.csv"), "utf8"), /^h,pasos,errMaxHeun/);

  assert.equal(correr("--salida", dir, "--reporte", bitacora, "--c0", "80").status, 0);
  const salida = B.importar(fs.readFileSync(bitacora, "utf8"));
  assert.equal(salida.agregados, 2);
  assert.ok(salida.reportes.some((x) => x.titulo === "Desde Node"));
  fs.rmSync(dir, { recursive: true });
});

test("la CLI rechaza entradas inválidas con código 2", () => {
  assert.equal(correr("--c0", "-5").status, 2);
  assert.equal(correr("--paso", "abc").status, 2);
  assert.equal(correr("--opcion-inexistente").status, 2);
});

test("el servidor entrega la app y bloquea rutas fuera del proyecto", async (t) => {
  const servidor = crearServidor();
  await new Promise((listo) => servidor.listen(0, "127.0.0.1", listo));
  t.after(() => servidor.close());
  const base = `http://127.0.0.1:${servidor.address().port}`;
  assert.match(await (await fetch(`${base}/app/`)).text(), /Agua Segura/);
  assert.equal((await fetch(`${base}/estudiantes.json`)).status, 200);
  assert.equal((await fetch(`${base}/no-existe`)).status, 404);
  assert.equal((await fetch(`${base}/%2e%2e/%2e%2e/secreto`)).status, 404);
});
