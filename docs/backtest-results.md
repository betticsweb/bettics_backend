# Resultados históricos Backtest

La rama de corrección del cruce actualiza la selección de fuentes, la normalización, los estados y el diagnóstico. Véase [backtest-historical-join-fix.md](backtest-historical-join-fix.md) para el contrato vigente y las limitaciones de validación real.

Implementación aditiva del PR #1. No cambia el ETL, la carga, sus validaciones, rutas anteriores, secretos ni configuración de Heroku. No crea índices o colecciones ni escribe documentos.

## Consulta autenticada

`GET /api/backtest/resultados` devuelve opciones de filtros, resumen, ranking mercado×liga, comparación mercado×segmento×liga, evolución diaria acumulada, mensual y detalle paginado. También están disponibles las respuestas parciales:

- `/api/backtest/resultados/resumen`
- `/api/backtest/resultados/ranking`
- `/api/backtest/resultados/segmentos`
- `/api/backtest/resultados/evolucion`
- `/api/backtest/resultados/mensual`
- `/api/backtest/resultados/detalle`

Filtros opcionales: `mercado`, `segmento`, `liga`, `temporada`, `desde`, `hasta`, `version_politica`, `orden` (`roi`, `aprobados`, `efectividad`, `ganancia`), `page` (desde 1), `limit` (1–100, predeterminado 25). Fechas ISO inclusivas. Solo evaluación `OOT`. Si hay múltiples versiones, se requiere elegir una antes de devolver métricas. La cuota media corresponde a todos los aprobados con cuota numérica; efectividad, ganancia y ROI solo a evaluados. Ganancia y porcentajes sin evaluados son `null`, visibles como «Sin datos».

Bearer JWT de usuario HS256, con `usuario` y expiración. Se verifica con `BETTICS_READ_JWT_SECRET`, o con `KEY_JWT` de Heroku si no hay configuración específica. No acepta el token ETL. Si las sesiones de Render usan otra clave, la nueva vista responde 401: no se supone que ambas claves coincidan. Antes de habilitarla debe configurarse en el servidor una confianza explícita para el emisor de las sesiones existentes o un intercambio de sesión; nunca poner claves o el token ETL en el frontend. Los módulos actuales siguen usando Render.

## Cruces y liquidación conservadora

Fuente de aprobados: `DB_Analytic_Bet.backtestAprobados`. Fuente histórica predeterminada `eventosLigaProb`, identificador `idEvent`, estado `strStatus`. Se pueden mapear explícitamente con `BETTICS_RESULTS_COLLECTION`, `BETTICS_RESULTS_ID_FIELD`, `BETTICS_RESULTS_STATUS_FIELD`, solo nombres simples de campos/colecciones. No hay consultas de fuente suministradas por el navegador.

El cruce automático admite ID numérico o cadena y exige exactamente un documento, fecha idéntica y liga idéntica. Si no coincide, falta o es ambiguo, queda pendiente con motivo. Un estado ausente o distinto de `FT` no confirma un resultado reglamentario. `AET`, `PEN`, suspensiones y anulaciones permanecen pendientes; no se extrapolan marcadores ni reglas de devolución. Ceros enteros son válidos; cadenas, negativos y ausentes no lo son. El empate de córners en HOME queda pendiente hasta contar con la regla de liquidación. Cada mercado verifica selección, línea y segmentos admitidos sin recalcular políticas.

Stake 1 por evaluado. Acierto: cuota−1; fallo: −1. ROI: ganancia/unidades evaluadas×100. Pendientes: ganancia `null`, stake evaluado 0. Cada segmento aprobado cuenta como un pronóstico; se muestra aparte el número de IDs de partido únicos. Nunca se mezclan versiones de política.

La fuente real no pudo consultarse desde este entorno por falta de acceso autenticado. Las cifras de las capturas y pruebas son simuladas, no una afirmación sobre los 19,812 registros. La aplicación intenta los cruces reales en cada actualización de caché y conserva cualquier caso no verificable como pendiente, sin requerir auditorías manuales.

## Rendimiento y límites

Lectura proyectada OOT en el servidor; cache de datos de 60 segundos por proceso y una sola carga concurrente. IDs únicos consultados por lotes de 500 con `$in`, sin una consulta por pronóstico ni carga completa al navegador. No se utiliza un modelo Mongoose que pueda crear índices automáticamente. Tope de 200,000 pronósticos; límite de 10,000 históricos por lote; consultas con `maxTimeMS=15000`. Si se exceden o falla Mongo, respuesta 503, nunca métricas parciales. Las respuestas son `private, no-store` y autenticadas incluso cuando hay caché.

Índices recomendados para el despliegue futuro: `backtestAprobados: {tipo_evaluacion:1,version_politica:1,fecha_partido:1}` y fuente histórica `{idEvent:1}` (o campo configurado). Revisar/reutilizar índices existentes y crear los faltantes únicamente como cambio administrativo autorizado, nunca desde GET. Sin el índice histórico las consultas pueden agotar tiempo y mostrar un error controlado. No se ha realizado ninguna operación sobre índices reales.

## Validación y publicación futura

- `node --test tests/*.test.js`: contratos, carga, protección, resultados, conciliación y APIs existentes. La integración MongoDB aislada se omite si no se proporciona su configuración de pruebas; no se usa MongoDB de producción.
- El frontend tiene prueba de navegador integrada con las funciones reales de cálculo del backend y fuentes sintéticas. Documentación en el repositorio frontend.
- La publicación futura del backend conserva Heroku Git y debe portarse aditivamente sobre el código desplegado; esta rama deriva del PR #1, no se afirma que sea el HEAD de Heroku.
- Mantener `BETTICS_BACKTEST_WRITES_ENABLED=false`; la lectura no depende de habilitarla. No tocar KNIME. No hay despliegue autorizado en esta entrega.
- Antes de publicar se debe comprobar lectura autenticada y configuración de fuente/estado; si faltan siguen visibles como pendientes, sin porcentajes inventados. Validar endpoints legacy tras el despliegue autorizado y conservar el release de reversión.
