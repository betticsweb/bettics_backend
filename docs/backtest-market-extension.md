# Ampliación de mercados: arquitectura y condiciones de activación

Inspección previa a la implementación, 2026-10-25.

La tabla madre continúa siendo DB_Analytic_Bet.backtestAprobados. El motor lee eventosLigaProb y eventosLiga mediante consultas proyectadas por colección, sin consultas individuales por partido ni escrituras. La unión validada es match_id -> idEvent; normalizeId conserva precisión, normaliza cadenas y números seguros. Se exige coincidencia de fecha y liga; resultados contradictorios o ausentes quedan pendientes. matchStatistics no constituye una fuente de marcadores individuales confirmada.

Los campos finales verificados son intHomeScore/intAwayScore y cornerKicksHome/cornerKicksAway. La confirmación de producción corresponde a eventosLigaProb. No hay campos HT confirmados en la evidencia disponible; nunca se sustituirán por FT. Stake 1, ganancia cuota-1 para acierto y -1 para fallo; pendientes y anulados no entran en el denominador del ROI. Las reglas originales de los cuatro mercados se conservan.

## Activación controlada

El catálogo adicional es declarativo y vacío por defecto: knime/backtest-market-policies.json. Solo se incorporan reglas con evidencia de política real revisada. Cada código representa una selección/línea única por versión: la identidad existente NO incluye selección ni línea, por lo que dos variantes nunca deben compartir código. No se cambia el índice ni se recalculan documentos existentes. El interruptor BETTICS_BACKTEST_WRITES_ENABLED continúa siendo false.

## Fuentes que faltan

No están en los repositorios accesibles Generacion_Interfaces, Generacion_Malla_Backtest.R, sus CSV OOT ni el script R original. Para cada variante se necesitan: nombre real del mercado, selección y período, línea real (HT), segmentos aprobados, versión de política, columna de aprobación calculada por R, probabilidad OOT, cuota histórica de la selección, identificador, fecha, liga, temporada y regla de empate/anulación. Para HT además faltan nombres de campos históricos y evidencia de que contienen marcadores HT definitivos. No se presupone línea 0.5 ni disponibilidad de todas las selecciones N1–N4.

El adaptador R entregado es aditivo: integra filas ya aprobadas y verificadas en la malla existente de 12 columnas. No reemplaza ni simula el generador original. Su conexión al generador queda pendiente de esos archivos. No se ejecutan cargas históricas nuevas.

## Contrato preparado

Cada entrada del manifiesto contiene `mercado`, `version_politica`, `family` (BTTS, FT_WINNER, HT_WINNER o HT_GOALS), `seleccion`, `linea`, `segmentos`, `verified: true` y `evidence` (referencia a la política original revisada). FT_WINNER requiere `drawRule: loss` porque es 1X2. HT_WINNER exige regla explícita loss/void/pending; HT_GOALS exige línea numérica real y pushRule void/pending. No se agrega ninguna política de ejemplo al manifiesto de producción.

Códigos reservados de navegación: AMBOS_MARCAN_SI/NO, GANADOR_FT_LOCAL/VISITANTE, GANADOR_HT_LOCAL/VISITANTE. No certifican la existencia de políticas: el frontend comprueba el catálogo del backend antes de enviar filtros y bloquea porcentajes si no hay correspondencia. Goles HT permanece sin código de navegación hasta conocer selección/línea reales. No se interpreta «Más de 0.5» como BTTS sin contrato explícito.

Operativo con políticas verificadas: validación de importación, BTTS y ganador FT, agregaciones existentes y enlaces a filtros persistentes. Pendiente: activar políticas auténticas y conectar el adaptador al generador R original. HT permanece pendiente incluso si se configura su política porque falta el mapeo histórico confirmado; no se declara implementada su evaluación con marcadores reales.

## Publicación y reversión

Esta entrega se propone como PR en borrador. No se despliega ni se carga: no hay beneficio en activar mercados vacíos sin verificar la malla. Conservar Heroku Git/main, el release v70 y escrituras false. Antes de una publicación posterior portar únicamente los archivos nuevos/modificados del módulo sobre el código desplegado; nunca publicar el master de GitHub completo ni usar force. El frontend funciona también con el backend actual (sin catálogo adicional): muestra un aviso en vez de consultas incompatibles. No se añaden dependencias de producción ni índices.

Pruebas de liquidación adicionales utilizan exclusivamente fixtures, no datos reales nuevos. La referencia Bundesliga real permanece en docs/backtest-v70-verification.json; no se ejecutó una nueva consulta privada de producción. Las pruebas originales cubren los cuatro mercados y la comparación de referencia. No se modificó MongoDB.
