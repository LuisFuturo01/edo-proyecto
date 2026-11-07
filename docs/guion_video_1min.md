# Guion del video: 1 minuto

Unas 140 palabras habladas. Preparar la aplicación abierta con el caso base.

| Tiempo | En pantalla | Narración |
|---|---|---|
| 0:00–0:10 | Cabecera de la aplicación | «Una comunidad rural depende de un tanque de mil litros contaminado con 50 miligramos por litro. Mi pregunta es: ¿en cuántas horas baja a 5 miligramos por litro? Los datos son hipotéticos.» |
| 0:10–0:22 | Sección del modelo | «Al entrar agua pura a 100 litros por hora y salir la mezcla, el balance de masa da la EDO dC/dt igual a menos k C, con C de cero igual a 50 y k igual a 0.1 por hora. Su solución exacta es C cero por e a la menos k t, comprobada por sustitución.» |
| 0:22–0:32 | Gráfico de concentración y panel | «La comparo con dos métodos numéricos. Heun corrige una predicción de Euler y RK4 promedia cuatro pendientes por paso.» |
| 0:32–0:47 | Cambiar h de 1 a 0.25; gráfico de error y tabla | «Puedo ajustar parámetros y paso. Al pasar h de 1 a 0.25, el error de Heun cae unas 17 veces y el de RK4 unas 270. RK4 siempre tuvo el menor error.» |
| 0:47–1:00 | Interpretación automática | «Resultado: se necesitan 23 horas y unos 2300 litros de agua limpia. Es una estimación con mezcla perfecta; declarar el agua potable exige análisis de laboratorio.» |

## Lista de comprobación

- [ ] Mencionar nombre, título del desafío y materia en la descripción del video.
- [ ] Duración total ≤ 1:00.
- [ ] Mostrar la URL pública en la barra del navegador.
- [ ] Si sobra tiempo, generar un reporte y mostrarlo en la bitácora.
