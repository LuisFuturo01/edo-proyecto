# Justificación del modelo

## 1. Problema y contexto

- **Desafío:** Agua Segura, purificación por dilución de un reservorio comunitario.
- **Beneficiarios:** familias de una comunidad rural que dependen de un único tanque de distribución.
- **Problema:** tras un evento de contaminación, el tanque contiene 50 mg/L de un contaminante. La comunidad necesita saber cuánto tiempo y cuánta agua limpia hacen falta para volver a un nivel objetivo.
- **Relevancia:** suspender el servicio demasiado tiempo deja a la comunidad sin agua; reabrirlo demasiado pronto la expone. Una estimación cuantitativa ayuda a planificar el abastecimiento alternativo.
- **Pregunta:** ¿en cuántas horas se logra C ≤ 5 mg/L?

Todos los valores son **hipotéticos y declarados como tales**. No describen un tanque, una comunidad ni un contaminante reales, y 5 mg/L es una meta didáctica, no una norma de potabilidad.

## 2. Formulación

| Símbolo | Significado | Valor | Unidad | Origen |
|---|---|---|---|---|
| C(t) | Concentración, variable dependiente | — | mg/L | Incógnita |
| t | Tiempo, variable independiente | [0, 48] | h | Horizonte elegido, dos veces t\* |
| V | Volumen constante | 1000 | L | Supuesto |
| Q | Caudal de entrada y salida | 100 | L/h | Supuesto |
| k | Tasa de dilución, Q/V | 0.1 | h⁻¹ | Derivado |
| C₀ | Concentración inicial | 50 | mg/L | Supuesto |
| C_s | Concentración objetivo | 5 | mg/L | Supuesto |

**Balance de masa.** Masa en el tanque: m(t) = V·C(t). Variación = entra − sale:

```
d(V·C)/dt = Q·C_entrada − Q·C(t),   C_entrada = 0
V·dC/dt   = −Q·C(t)
dC/dt     = −(Q/V)·C(t) = −k·C(t),  C(0) = C₀
```

Comprobación dimensional: `[mg/(L·h)] = [1/h]·[mg/L]`.

**Supuestos.** Mezcla perfecta e instantánea; entrada sin contaminante; contaminante conservativo (sin reacción ni sedimentación); V y Q constantes.

## 3. Solución analítica

Para C > 0, separando variables:

```
dC/C = −k dt
∫ dC/C = −k ∫ dt
ln C = −k·t + A
C(t) = e^A · e^(−k·t)
C(0) = e^A = C₀   ⇒   C(t) = C₀·e^(−k·t)
```

**Comprobación por sustitución.**

- En la EDO: C′(t) = −k·C₀·e^(−k·t) = −k·C(t). ✓
- En la condición inicial: C(0) = C₀·e⁰ = C₀. ✓

La prueba numérica de `tests/numerics.test.js` repite la sustitución con diferencia centrada; la CLI informa un residuo máximo de 4.5e-10 mg/(L·h), atribuible a la diferencia finita y al redondeo.

**Tiempo al umbral.**

```
C₀·e^(−k·t*) = C_s  ⇒  t* = ln(C₀/C_s)/k = ln(10)/0.1 = 23.0259 h
```

Agua consumida: Q·t\* ≈ 2303 L, es decir 2.3 veces el volumen del tanque. Cada volumen renovado reduce la concentración a e⁻¹ ≈ 37 %, no a cero, porque la mezcla expulsa agua limpia junto con el contaminante.

## 4. Métodos numéricos

Se aplican con los mismos parámetros, condición inicial, intervalo y h.

**Heun (RK2 predictor-corrector).**

```
C* = Cᵢ + h·f(tᵢ, Cᵢ)
Cᵢ₊₁ = Cᵢ + (h/2)·[f(tᵢ, Cᵢ) + f(tᵢ₊₁, C*)]
```

**RK4 clásico.**

```
k₁ = f(tᵢ, Cᵢ)
k₂ = f(tᵢ + h/2, Cᵢ + h·k₁/2)
k₃ = f(tᵢ + h/2, Cᵢ + h·k₂/2)
k₄ = f(tᵢ + h,   Cᵢ + h·k₃)
Cᵢ₊₁ = Cᵢ + (h/6)·(k₁ + 2k₂ + 2k₃ + k₄)
```

**Primer paso a mano (h = 1, C₀ = 50).**

| Método | Cálculo | C(1) |
|---|---|---|
| Heun | C\* = 45; C₁ = 50 + 0.5·(−5 − 4.5) | 45.250000 |
| RK4 | k = −5, −4.75, −4.7625, −4.52375 | 45.241875 |
| Exacta | 50·e^(−0.1) | 45.241871 |

**Factor de amplificación.** Con z = −k·h, cada paso multiplica la solución por G(z) = 1 + z + z²/2 (Heun) o G(z) = 1 + z + z²/2 + z³/6 + z⁴/24 (RK4). Ambos son las series de Taylor truncadas de e^z, lo que explica los órdenes 2 y 4. El cálculo es inestable si |G| ≥ 1: k·h ≥ 2 para Heun y k·h ≥ 2.785 para RK4. La aplicación lo avisa, para no confundir ese artefacto con un aumento real del contaminante.

## 5. Teoría de errores

- Error absoluto: `E_abs = |C_analítica − C_numérica|` [mg/L]
- Error relativo porcentual: `E_rel = |C_analítica − C_numérica| / |C_analítica| · 100` [%]

C_analítica es positiva en todo t finito, y el código protege igualmente la división si la referencia cae a cero por subdesbordamiento.

**Comparación obligatoria, caso base con T = 48 h:**

| h [h] | Pasos | E máx. Heun [mg/L] | E máx. RK4 [mg/L] | E % en t = 48 Heun | E % en t = 48 RK4 |
|---|---|---|---|---|---|
| 1.0 | 48 | 3.3077e-02 | 1.6662e-05 | 8.6612e-01 | 4.3481e-04 |
| 0.25 | 192 | 1.9524e-03 | 6.1137e-08 | 5.0960e-02 | 1.5954e-06 |

Al dividir h entre 4, Heun mejora ≈ 17 veces (teoría: 4² = 16) y RK4 ≈ 273 veces (teoría: 4⁴ = 256). Los órdenes observados tienden a 2.01 y 4.01 al refinar (`resultados/convergencia.csv`).

## 6. Interpretación y conclusiones

- **Para la comunidad:** con estos supuestos, el tanque necesitaría cerca de **23 horas** de renovación continua y unos **2300 L** de agua limpia. Durante ese tiempo conviene planificar otra fuente de agua. Duplicar el caudal reduce el tiempo a la mitad, pero no el volumen de agua requerido.
- **Métodos:** RK4 produjo el menor error en todos los ensayos, unas 2000 veces menor que Heun con h = 1 h y a costa de 4 evaluaciones de f por paso frente a 2. Con h = 1 h, ambos bastan para esta decisión práctica: Heun difiere del t\* exacto en 0.045 h (menos de 3 minutos).

## 7. Limitaciones

- Una simulación no es una predicción comprobada: faltan datos reales que validen el modelo.
- La mezcla real no es perfecta; un tanque con zonas muertas tardaría más.
- Si el contaminante reacciona, sedimenta o entra con el agua de reposición, cambia la EDO.
- Declarar el agua apta para consumo exige análisis de laboratorio; el modelo sólo orienta la planificación.
