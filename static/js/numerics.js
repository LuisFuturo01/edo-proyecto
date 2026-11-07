/**
 * Núcleo numérico del simulador. Sin dependencias: el mismo archivo se ejecuta en
 * Node.js (CLI y pruebas) y en el navegador.
 *
 * Modelo: dC/dt = -k C, C(0) = C0, k = Q / V.
 * Unidades: t [h], C [mg/L], k [1/h], Q [L/h], V [L].
 */
(function (global, fabrica) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = fabrica();
  } else {
    global.Numerics = fabrica();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MAX_PASOS = 20000;
  const MINIMO_REFERENCIA = 1e-300;
  const PATRON_NUMERO = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

  /** Convierte texto del teclado en número; admite coma decimal. Devuelve NaN si no es válido. */
  function leerNumero(texto) {
    const limpio = String(texto ?? "").trim().replace(",", ".");
    return PATRON_NUMERO.test(limpio) ? Number(limpio) : NaN;
  }

  /** Tasa de dilución k = Q / V [1/h]. */
  function tasaDilucion(caudal, volumen) {
    return caudal / volumen;
  }

  /** Solución exacta C(t) = C0 exp(-k t) [mg/L]. */
  function analitica(t, c0, k) {
    return c0 * Math.exp(-k * t);
  }

  /** Instante exacto t* = ln(C0 / Cu) / k [h]; 0 si C0 ya cumple el umbral. */
  function tiempoExacto(c0, k, cUmbral) {
    return c0 <= cUmbral ? 0 : Math.log(c0 / cUmbral) / k;
  }

  /** Malla t_i = i h con último nodo en tFinal (último paso recortado si hace falta). */
  function malla(tFinal, h) {
    const n = Math.ceil(tFinal / h - 1e-12);
    const tiempos = new Array(n + 1);
    for (let i = 0; i < n; i++) tiempos[i] = i * h;
    tiempos[n] = tFinal;
    return tiempos;
  }

  /** Heun (RK2 predictor-corrector) para y' = f(y); error local O(h^3). */
  function pasoHeun(f, y, h) {
    const k1 = f(y);
    const k2 = f(y + h * k1);
    return y + 0.5 * h * (k1 + k2);
  }

  /** Runge-Kutta clásico de orden 4 para y' = f(y); error local O(h^5). */
  function pasoRk4(f, y, h) {
    const k1 = f(y);
    const k2 = f(y + 0.5 * h * k1);
    const k3 = f(y + 0.5 * h * k2);
    const k4 = f(y + h * k3);
    return y + (h * (k1 + 2 * k2 + 2 * k3 + k4)) / 6;
  }

  /** Primer instante con y <= umbral, con interpolación lineal en el paso del cruce. */
  function primerCruce(tiempos, valores, umbral) {
    if (valores[0] <= umbral) return tiempos[0];
    for (let i = 1; i < valores.length; i++) {
      if (valores[i] <= umbral) {
        const fraccion = (valores[i - 1] - umbral) / (valores[i - 1] - valores[i]);
        return tiempos[i - 1] + fraccion * (tiempos[i] - tiempos[i - 1]);
      }
    }
    return null;
  }

  function errorRelativo(exacto, aproximado) {
    return Math.abs(exacto) < MINIMO_REFERENCIA
      ? null
      : (Math.abs(exacto - aproximado) / Math.abs(exacto)) * 100;
  }

  /** Factores de amplificación por paso para y' = -k y, con z = -k h. */
  function amplificacion(k, h) {
    const z = -k * h;
    const heun = 1 + z + (z * z) / 2;
    return { heun, rk4: heun + (z * z * z) / 6 + (z * z * z * z) / 24, kh: k * h };
  }

  /**
   * Ejecuta ambos métodos y calcula los errores nodo a nodo.
   * @param {{c0:number,k:number,tFinal:number,h:number,cSegura:number}} p
   */
  function simular(p) {
    const f = (c) => -p.k * c;
    const tiempos = malla(p.tFinal, p.h);
    const heun = [p.c0];
    const rk4 = [p.c0];
    for (let i = 0; i < tiempos.length - 1; i++) {
      const paso = tiempos[i + 1] - tiempos[i];
      heun.push(pasoHeun(f, heun[i], paso));
      rk4.push(pasoRk4(f, rk4[i], paso));
    }
    let errMaxHeun = 0;
    let errMaxRk4 = 0;
    const filas = tiempos.map((t, i) => {
      const exacta = analitica(t, p.c0, p.k);
      const errHeun = Math.abs(exacta - heun[i]);
      const errRk4 = Math.abs(exacta - rk4[i]);
      errMaxHeun = Math.max(errMaxHeun, errHeun);
      errMaxRk4 = Math.max(errMaxRk4, errRk4);
      return {
        t,
        analitica: exacta,
        heun: heun[i],
        rk4: rk4[i],
        errAbsHeun: errHeun,
        errAbsRk4: errRk4,
        errRelHeun: errorRelativo(exacta, heun[i]),
        errRelRk4: errorRelativo(exacta, rk4[i]),
      };
    });
    return {
      filas,
      errMaxHeun,
      errMaxRk4,
      tExacto: tiempoExacto(p.c0, p.k, p.cSegura),
      cruceHeun: primerCruce(tiempos, heun, p.cSegura),
      cruceRk4: primerCruce(tiempos, rk4, p.cSegura),
      amplificacion: amplificacion(p.k, p.h),
    };
  }

  /**
   * Error máximo y orden observado p = log2(e(h) / e(h/2)) para cada paso.
   * El orden sólo se calcula si h es la mitad exacta del paso anterior.
   */
  function convergencia(p, pasos) {
    const filas = [];
    for (const h of pasos) {
      const r = simular({ ...p, h });
      const previa = filas[filas.length - 1];
      const mitad = previa && Math.abs(previa.h - 2 * h) < 1e-12;
      filas.push({
        h,
        pasos: r.filas.length - 1,
        errMaxHeun: r.errMaxHeun,
        errMaxRk4: r.errMaxRk4,
        ordenHeun: mitad ? Math.log2(previa.errMaxHeun / r.errMaxHeun) : null,
        ordenRk4: mitad ? Math.log2(previa.errMaxRk4 / r.errMaxRk4) : null,
        cruceHeun: r.cruceHeun,
        cruceRk4: r.cruceRk4,
      });
    }
    return filas;
  }

  /**
   * Comprobación por sustitución: máximo de |C'(t) + k C(t)| en 101 nodos, con C'
   * aproximada por diferencia centrada de orden 2. Mide un residuo [mg/(L h)].
   */
  function residuoSustitucion(c0, k, tFinal) {
    const delta = 1e-5;
    let residuo = 0;
    for (let i = 0; i <= 100; i++) {
      const t = (tFinal * i) / 100;
      const derivada = (analitica(t + delta, c0, k) - analitica(t - delta, c0, k)) / (2 * delta);
      residuo = Math.max(residuo, Math.abs(derivada + k * analitica(t, c0, k)));
    }
    return residuo;
  }

  /** Valida entradas y devuelve un mapa campo -> mensaje; vacío si todo es válido. */
  function validar(p) {
    const errores = {};
    const positivo = (campo, nombre, unidad) => {
      if (!Number.isFinite(p[campo]) || p[campo] <= 0) {
        errores[campo] = `${nombre} debe ser un número mayor que 0 ${unidad}.`;
      }
    };
    if (p.volumen !== undefined) positivo("volumen", "El volumen V", "L");
    if (p.caudal !== undefined) positivo("caudal", "El caudal Q", "L/h");
    positivo("c0", "C₀", "mg/L");
    if (!errores.volumen && !errores.caudal) positivo("k", "k", "h⁻¹");
    positivo("tFinal", "El tiempo de simulación", "h");
    positivo("h", "El paso h", "h");
    positivo("cSegura", "La concentración segura", "mg/L");
    if (!errores.h && !errores.tFinal) {
      if (p.h > p.tFinal) errores.h = "El paso h no puede superar el tiempo de simulación.";
      else if (p.tFinal / p.h > MAX_PASOS) {
        errores.h = `Demasiados pasos: T/h no debe superar ${MAX_PASOS}.`;
      }
    }
    return errores;
  }

  return {
    leerNumero,
    tasaDilucion,
    analitica,
    tiempoExacto,
    malla,
    pasoHeun,
    pasoRk4,
    primerCruce,
    amplificacion,
    simular,
    convergencia,
    residuoSustitucion,
    validar,
    MAX_PASOS,
  };
});
