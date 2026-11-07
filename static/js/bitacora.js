/**
 * Reportes y bitácora compartible. Sin dependencias del DOM: se ejecuta en Node.js y
 * en el navegador.
 *
 * Un reporte guarda parámetros, resultados e interpretación. Al importar, todo reporte
 * se recalcula desde sus parámetros y se rechaza si sus resultados no coinciden, de modo
 * que un archivo compartido no puede introducir cifras alteradas.
 */
(function (global, fabrica) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = fabrica(require("./numerics.js"));
  } else {
    global.Bitacora = fabrica(global.Numerics);
  }
})(typeof self !== "undefined" ? self : this, function (N) {
  "use strict";

  const FORMATO = "agua-segura/bitacora";
  const VERSION = 1;
  const PASOS_OBLIGATORIOS = [1, 0.25];
  const CAMPOS_PARAMETROS = ["volumen", "caudal", "c0", "cSegura", "tFinal", "h"];
  const MAX_TITULO = 120;
  const MAX_NOTAS = 2000;
  const MAX_REPORTES = 5000;
  const MAX_BYTES_ARCHIVO = 10 * 1024 * 1024;
  const TOLERANCIA_RELATIVA = 1e-9;
  const PATRON_ID = /^[A-Za-z0-9_-]{1,64}$/;

  const seguro = (v) => (Number.isFinite(v) ? v : null);
  const fijo = (v, d) => (v === null ? "—" : v.toFixed(d));
  const exp = (v) => (v === null ? "—" : v.toExponential(3));

  function aHorasMinutos(horas) {
    let h = Math.floor(horas);
    let m = Math.round((horas - h) * 60);
    if (m === 60) {
      h += 1;
      m = 0;
    }
    return `${h} h ${m} min`;
  }

  /** Añade la tasa derivada k = Q / V a los parámetros de entrada. */
  function completarParametros(p) {
    return { ...p, k: N.tasaDilucion(p.caudal, p.volumen) };
  }

  /** Fila de comparación de un tamaño de paso; los valores no finitos pasan a null. */
  function compararPaso(p, h) {
    const r = N.simular({ ...p, h });
    const ultima = r.filas[r.filas.length - 1];
    return {
      h,
      pasos: r.filas.length - 1,
      errMaxHeun: seguro(r.errMaxHeun),
      errMaxRk4: seguro(r.errMaxRk4),
      errRelFinalHeun: seguro(ultima.errRelHeun),
      errRelFinalRk4: seguro(ultima.errRelRk4),
      cruceHeun: seguro(r.cruceHeun),
      cruceRk4: seguro(r.cruceRk4),
    };
  }

  /** Comparación obligatoria h = 1 y h = 0.25, más el paso elegido si es distinto. */
  function comparar(p) {
    const pasos = PASOS_OBLIGATORIOS.includes(p.h) ? [...PASOS_OBLIGATORIOS] : [...PASOS_OBLIGATORIOS, p.h];
    return pasos
      .sort((a, b) => b - a)
      .filter((h) => h <= p.tFinal && p.tFinal / h <= N.MAX_PASOS)
      .map((h) => compararPaso(p, h));
  }

  function resumirResultados(p, r) {
    return {
      k: p.k,
      pasos: r.filas.length - 1,
      tExacto: seguro(r.tExacto),
      cruceHeun: seguro(r.cruceHeun),
      cruceRk4: seguro(r.cruceRk4),
      errMaxHeun: seguro(r.errMaxHeun),
      errMaxRk4: seguro(r.errMaxRk4),
      concentracionFinal: seguro(r.filas[r.filas.length - 1].analitica),
      amplificacionHeun: seguro(r.amplificacion.heun),
      amplificacionRk4: seguro(r.amplificacion.rk4),
      kh: seguro(r.amplificacion.kh),
    };
  }

  /** Lectura en lenguaje sencillo de un resultado; devuelve texto plano. */
  function interpretar(p, res) {
    const parrafos = [];
    if (p.c0 <= p.cSegura) {
      parrafos.push(`El agua ya inicia en ${fijo(p.c0, 2)} mg/L, por debajo del objetivo de ${fijo(p.cSegura, 2)} mg/L: en este modelo no hace falta diluir.`);
    } else if (res.tExacto > p.tFinal) {
      parrafos.push(`En las ${fijo(p.tFinal, 1)} h simuladas el tanque no llega a la meta: termina en ${fijo(res.concentracionFinal, 2)} mg/L. La solución exacta indica que harían falta ${fijo(res.tExacto, 2)} h; aumente T para verlo en el gráfico.`);
    } else {
      const litros = p.caudal * res.tExacto;
      parrafos.push(`Con el tanque en ${fijo(p.c0, 2)} mg/L y una renovación k = ${fijo(res.k, 3)} h⁻¹ (Q = ${fijo(p.caudal, 1)} L/h en ${fijo(p.volumen, 0)} L), el agua alcanza ${fijo(p.cSegura, 2)} mg/L a las ${fijo(res.tExacto, 2)} h, es decir, unas ${aHorasMinutos(res.tExacto)}. Eso consume cerca de ${Math.round(litros)} L de agua pura, ${fijo(litros / p.volumen, 1)} veces el volumen del tanque, porque la mezcla diluye cada vez más lento.`);
    }

    if (p.c0 > p.cSegura && res.cruceHeun !== null && res.cruceRk4 !== null) {
      const difHeun = Math.abs(res.cruceHeun - res.tExacto);
      const difRk4 = Math.abs(res.cruceRk4 - res.tExacto);
      parrafos.push(`Con h = ${p.h} h, Heun estima el cruce con una diferencia de ${exp(difHeun)} h (${fijo(difHeun * 60, 2)} min) y RK4 de ${exp(difRk4)} h frente al valor exacto. Parte de esa diferencia proviene de interpolar linealmente dentro del paso del cruce.`);
    }

    if (res.errMaxHeun !== null && res.errMaxRk4 !== null && res.errMaxHeun !== res.errMaxRk4) {
      const ganaRk4 = res.errMaxRk4 < res.errMaxHeun;
      const menor = ganaRk4 ? res.errMaxRk4 : res.errMaxHeun;
      const mayor = ganaRk4 ? res.errMaxHeun : res.errMaxRk4;
      const razon = menor > 0 ? `, ${Math.round(mayor / menor)} veces menor` : "";
      parrafos.push(`${ganaRk4 ? "RK4" : "Heun"} produjo el menor error máximo en este ensayo: ${exp(menor)} mg/L frente a ${exp(mayor)} mg/L${razon}.`);
    }
    return parrafos;
  }

  /** Advertencia de estabilidad del paso; null si el paso es adecuado. */
  function avisoEstabilidad(res) {
    const inestables = [];
    if (res.amplificacionHeun === null || Math.abs(res.amplificacionHeun) >= 1) inestables.push("Heun");
    if (res.amplificacionRk4 === null || Math.abs(res.amplificacionRk4) >= 1) inestables.push("RK4");
    if (inestables.length) {
      return `Paso demasiado grande: k·h = ${fijo(res.kh, 3)} vuelve numéricamente inestable a ${inestables.join(" y ")}. La oscilación o el crecimiento del gráfico es un artefacto del cálculo; el contaminante no aumenta en el modelo. Reduzca h.`;
    }
    return res.kh > 0.5 ? `k·h = ${fijo(res.kh, 3)} es estable, pero grueso: use un h menor para resultados más precisos.` : null;
  }

  /** Calcula todo lo que muestra la interfaz y guarda un reporte. */
  function analizar(parametros) {
    const p = completarParametros(parametros);
    const r = N.simular(p);
    const resultados = resumirResultados(p, r);
    return {
      p,
      filas: r.filas,
      resultados,
      comparacion: comparar(p),
      interpretacion: interpretar(p, resultados),
      aviso: avisoEstabilidad(resultados),
    };
  }

  function nuevoId(ahora) {
    return `${ahora.getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function tituloPredeterminado(p) {
    return `C₀ = ${p.c0} mg/L, k = ${Number(N.tasaDilucion(p.caudal, p.volumen).toPrecision(6))} h⁻¹, h = ${p.h} h`;
  }

  /** Crea un reporte inmutable a partir de parámetros ya validados. */
  function crearReporte(parametros, datos = {}) {
    const ahora = datos.fecha ? new Date(datos.fecha) : new Date();
    const entrada = Object.fromEntries(CAMPOS_PARAMETROS.map((c) => [c, parametros[c]]));
    const a = analizar(entrada);
    return {
      id: datos.id || nuevoId(ahora),
      fecha: ahora.toISOString(),
      titulo: String(datos.titulo || "").trim().slice(0, MAX_TITULO) || tituloPredeterminado(entrada),
      notas: String(datos.notas || "").trim().slice(0, MAX_NOTAS),
      parametros: entrada,
      resultados: a.resultados,
      comparacion: a.comparacion,
      interpretacion: a.interpretacion,
      aviso: a.aviso,
    };
  }

  function coinciden(a, b, escala) {
    if (a === null || b === null || a === undefined || b === undefined) return (a ?? null) === (b ?? null);
    if (typeof a === "number" && typeof b === "number") {
      return Math.abs(a - b) <= TOLERANCIA_RELATIVA * Math.max(Math.abs(a), Math.abs(b), escala);
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((v, i) => coinciden(v, b[i], escala));
    }
    if (typeof a === "object" && typeof b === "object") {
      const claves = Object.keys(b);
      return claves.every((c) => coinciden(a[c], b[c], escala));
    }
    return false;
  }

  /**
   * Valida un reporte de origen externo y devuelve una copia limpia, recalculada.
   * @returns {{ok:true,reporte:object}|{ok:false,motivo:string}}
   */
  function validarReporte(crudo) {
    if (crudo === null || typeof crudo !== "object" || Array.isArray(crudo)) return { ok: false, motivo: "no es un reporte" };
    if (typeof crudo.id !== "string" || !PATRON_ID.test(crudo.id)) return { ok: false, motivo: "identificador inválido" };
    if (typeof crudo.fecha !== "string" || Number.isNaN(Date.parse(crudo.fecha))) return { ok: false, motivo: "fecha inválida" };
    if (typeof crudo.titulo !== "string" || typeof crudo.notas !== "string") return { ok: false, motivo: "título o notas inválidos" };
    if (crudo.parametros === null || typeof crudo.parametros !== "object") return { ok: false, motivo: "sin parámetros" };
    if (crudo.resultados === null || typeof crudo.resultados !== "object") return { ok: false, motivo: "sin resultados" };

    const parametros = {};
    for (const campo of CAMPOS_PARAMETROS) {
      if (typeof crudo.parametros[campo] !== "number") return { ok: false, motivo: `parámetro ${campo} inválido` };
      parametros[campo] = crudo.parametros[campo];
    }
    const errores = N.validar(completarParametros(parametros));
    const primero = Object.values(errores)[0];
    if (primero) return { ok: false, motivo: primero };

    const reporte = crearReporte(parametros, { id: crudo.id, fecha: crudo.fecha, titulo: crudo.titulo, notas: crudo.notas });
    if (!coinciden(crudo.resultados, reporte.resultados, parametros.c0)) {
      return { ok: false, motivo: "sus resultados no coinciden con el recálculo" };
    }
    return { ok: true, reporte };
  }

  function ordenar(reportes) {
    return [...reportes].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  /** Documento JSON compartible con uno o varios reportes. */
  function exportar(reportes, ahora = new Date()) {
    return { formato: FORMATO, version: VERSION, exportado: ahora.toISOString(), total: reportes.length, reportes: ordenar(reportes) };
  }

  /**
   * Interpreta un archivo de bitácora y lo combina con los reportes existentes. Un id ya
   * presente conserva la versión local.
   * @throws {Error} si el archivo completo no es una bitácora válida.
   */
  function importar(texto, existentes = []) {
    if (texto.length > MAX_BYTES_ARCHIVO) throw new Error("El archivo supera el máximo de 10 MB.");
    let documento;
    try {
      documento = JSON.parse(texto);
    } catch {
      throw new Error("El archivo no contiene JSON válido.");
    }
    if (documento === null || documento.formato !== FORMATO) throw new Error("El archivo no es una bitácora de este simulador.");
    if (documento.version !== VERSION) throw new Error(`Versión de bitácora no admitida: ${documento.version}.`);
    if (!Array.isArray(documento.reportes)) throw new Error("La bitácora no contiene una lista de reportes.");
    if (documento.reportes.length + existentes.length > MAX_REPORTES) throw new Error(`La bitácora resultante superaría ${MAX_REPORTES} reportes.`);

    const porId = new Map(existentes.map((r) => [r.id, r]));
    const rechazados = [];
    let agregados = 0;
    let duplicados = 0;
    documento.reportes.forEach((crudo, indice) => {
      const validado = validarReporte(crudo);
      if (!validado.ok) {
        rechazados.push({ indice, motivo: validado.motivo });
      } else if (porId.has(validado.reporte.id)) {
        duplicados += 1;
      } else {
        porId.set(validado.reporte.id, validado.reporte);
        agregados += 1;
      }
    });
    return { reportes: ordenar([...porId.values()]), agregados, duplicados, rechazados };
  }

  return { FORMATO, VERSION, MAX_TITULO, MAX_NOTAS, completarParametros, analizar, crearReporte, validarReporte, exportar, importar, ordenar };
});
