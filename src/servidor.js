#!/usr/bin/env node
/** Servidor estático local, sin dependencias. Uso: node src/servidor.js [puerto] */
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function resolver(urlSolicitada) {
  const ruta = decodeURIComponent(new URL(urlSolicitada, "http://local").pathname);
  const destino = path.resolve(RAIZ, `.${ruta}`);
  if (destino !== RAIZ && !destino.startsWith(RAIZ + path.sep)) return null;
  return fs.existsSync(destino) && fs.statSync(destino).isDirectory() ? path.join(destino, "index.html") : destino;
}

function crearServidor() {
  return http.createServer((solicitud, respuesta) => {
    let destino = null;
    try {
      destino = resolver(solicitud.url);
    } catch {
      destino = null;
    }
    if (!destino || !fs.existsSync(destino)) {
      respuesta.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      respuesta.end("No encontrado");
      return;
    }
    respuesta.writeHead(200, { "Content-Type": TIPOS[path.extname(destino)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(destino).pipe(respuesta);
  });
}

if (require.main === module) {
  const puerto = Number(process.argv[2] || process.env.PORT || 8000);
  crearServidor().listen(puerto, "127.0.0.1", () => console.log(`Simulador en http://localhost:${puerto}/`));
}

module.exports = { crearServidor };
