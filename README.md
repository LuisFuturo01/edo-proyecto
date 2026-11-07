# Agua Segura: purificación de un reservorio comunitario

Desafío individual de Métodos Numéricos. Modela con una EDO de primer orden la dilución de un contaminante en el tanque de distribución de una comunidad rural, resuelve el modelo con Heun, RK4 y solución analítica, y responde: **¿en cuántas horas se logra C ≤ 5 mg/L?**

**Respuesta del caso base:** t\* = ln(50/5)/0.1 = **23.03 h** (≈ 23 h 2 min). Los parámetros son hipotéticos y están declarados como tales.

Todo el proyecto es JavaScript: los cálculos, la línea de comandos, las pruebas y el servidor local usan sólo Node.js, sin paquetes que instalar. La web usa además Chart.js, incluido en `static/vendor/`.

## Modelo

| Elemento | Definición |
|---|---|
| Variable dependiente | C(t), concentración [mg/L] |
| Variable independiente | t, tiempo [h] |
| Parámetros | V = 1000 L, Q = 100 L/h, k = Q/V = 0.1 h⁻¹ |
| EDO y condición inicial | dC/dt = −k·C, C(0) = C₀ = 50 mg/L |
| Solución exacta | C(t) = C₀·e^(−k·t) |
| Intervalo | [0, 48] h por defecto |

La demostración, los supuestos y la justificación están en [docs/justificacion_modelo.md](docs/justificacion_modelo.md).

## Uso de la aplicación

1. **Datos por teclado.** Escriba V, Q o k, C₀, C segura, T y h; admite coma o punto decimal. Los cálculos se actualizan al teclear, y un valor inválido muestra el motivo.
2. **Generar reporte.** Con un título y notas opcionales, crea un reporte con datos, resultados, interpretación, gráfico, comparación de pasos y tabla paso a paso. Se puede imprimir o guardar como PDF, y descargar en JSON o CSV.
3. **Bitácora.** Cada reporte queda en la caché del navegador (`localStorage`) y sobrevive al cierre de la página. Se puede buscar, abrir, cargar en el simulador o eliminar.
4. **Exportar e importar.** *Exportar JSON* descarga la bitácora para compartirla o respaldarla. *Importar JSON* la combina con la actual sin duplicar.

La caché pertenece a cada navegador y dispositivo, y se pierde si se borran los datos del sitio: exporte la bitácora para conservarla.

## Formato de la bitácora

```json
{
  "formato": "agua-segura/bitacora",
  "version": 1,
  "exportado": "2026-11-06T22:00:00.000Z",
  "total": 1,
  "reportes": [
    {
      "id": "mw5ti0tm-4qwzl1y6",
      "fecha": "2026-11-06T22:00:00.000Z",
      "titulo": "Tanque norte",
      "notas": "Ensayo 1",
      "parametros": { "volumen": 1000, "caudal": 100, "c0": 50, "cSegura": 5, "tFinal": 48, "h": 1 },
      "resultados": { "k": 0.1, "tExacto": 23.0258, "...": "..." },
      "comparacion": [],
      "interpretacion": [],
      "aviso": null
    }
  ]
}
```

Reglas al importar:

- Cada reporte se recalcula desde sus parámetros. Si sus `resultados` no coinciden (tolerancia relativa de 1e-9), se rechaza y se informa el motivo; los demás se importan.
- Si el `id` ya existe, se conserva la versión local.
- Comparación, interpretación y aviso se regeneran; los campos desconocidos se descartan.
- La tabla paso a paso no se guarda: se regenera desde los parámetros.

## Estructura

```
proyecto_individual_edo/
├── estudiantes.json     Datos consumidos por el modal (reemplazar por los reales)
├── package.json         Comandos npm; sin dependencias
├── index.html           Redirección a app/
├── app/index.html       Aplicación web
├── static/
│   ├── js/numerics.js      Núcleo numérico, común a Node.js y al navegador
│   ├── js/bitacora.js      Reportes, validación, exportación e importación
│   ├── js/app.js           Interfaz del simulador
│   ├── js/ui-bitacora.js   Interfaz de la bitácora y caché
│   ├── js/estudiantes.js   Burbuja y modal
│   ├── css/ y vendor/      Estilos y Chart.js 4.4.9
├── src/
│   ├── simular.js       CLI: tablas, CSV y reportes
│   └── servidor.js      Servidor estático local
├── tests/               Pruebas con node:test
├── resultados/          CSV generados por la CLI
└── docs/                Justificación del modelo y guion del video
```

## Ejecución local

Requiere Node.js 18.3 o superior. Desde esta carpeta:

```bash
npm start
```

Abrir `http://localhost:8000/`.

## CLI y pruebas

```bash
node src/simular.js
```

```bash
node src/simular.js --c0 80 --k 0.2 --t-final 40 --paso 1 --paso 0.25
```

Para crear o ampliar una bitácora desde Node.js, importable luego en la web:

```bash
node src/simular.js --reporte bitacora.json --titulo "Ensayo A"
```

```bash
npm test
```

## Resultados del caso base

| h [h] | E máx. Heun [mg/L] | Orden | E máx. RK4 [mg/L] | Orden | t\* Heun [h] | t\* RK4 [h] |
|---|---|---|---|---|---|---|
| 1 | 3.3077e-02 | 2.11 | 1.6662e-05 | 4.12 | 23.07047 | 23.02715 |
| 0.5 | 7.9590e-03 | 2.06 | 9.9880e-07 | 4.06 | 23.03665 | 23.02647 |
| 0.25 | 1.9524e-03 | 2.03 | 6.1137e-08 | 4.03 | 23.02861 | 23.02614 |

RK4 produjo el menor error en todos los ensayos. t\* exacto = 23.02585 h. Con h pequeño, la diferencia restante en t\* de RK4 proviene de interpolar linealmente dentro del paso del cruce, no del método.

## Despliegue público

La web es estática y no necesita compilación: en producción, `numerics.js` y `bitacora.js` se ejecutan en el navegador del visitante.

### Netlify

1. Subir este proyecto a GitHub.
2. En Netlify: *Add new site → Import an existing project* y elegir el repositorio.
3. Si el repositorio contiene otras carpetas, fijar *Base directory* en `proyecto_individual_edo`. `netlify.toml` ya publica la carpeta completa.

Alternativa sin Git: arrastrar esta carpeta a <https://app.netlify.com/drop>.

### Vercel

1. *Add New → Project* e importar el repositorio.
2. *Root Directory*: `proyecto_individual_edo`. *Framework Preset*: **Other**. Sin comando de compilación.

### GitHub Pages

*Settings → Pages → Deploy from a branch*, publicando la raíz del repositorio si contiene sólo este proyecto.

## Antes de entregar

- Reemplazar los datos de ejemplo de `estudiantes.json`.
- Publicar la aplicación y el repositorio, y grabar el video siguiendo [docs/guion_video_1min.md](docs/guion_video_1min.md).
- Entregar los tres enlaces con nombre completo, título del desafío y materia.
