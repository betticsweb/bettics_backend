# Ampliar la malla existente: alcance corregido

Se mantiene exactamente el flujo R Source de KNIME -> bettics_backtest_aprobados.csv -> nodo Python Legacy -> POST /api/backtest/registrarMasivo -> DB_Analytic_Bet.backtestAprobados. No hay otro ETL, colección, manifiesto de aprobación o archivo intermedio obligatorio. Se retiraron preparar_malla_ft.R y sus requisitos adicionales de recomendaciones_hist.csv, auditoría temporal nueva y manifiesto por versión.

## Implementado sin depender del R ausente

Tres contratos adicionales aceptados directamente por el mismo validador y nodo Python:

| mercado | periodo | seleccion | linea | segmentos estructurales |
|---|---|---|---|---|
| BTTS_YES | FT | YES | null | N1,N2,N3 |
| FT_HOME_WIN | FT | HOME | null | N1,N2,N3 |
| FT_AWAY_WIN | FT | AWAY | null | N1,N2,N3 |

Esto valida el formato, NO certifica ni recalcula umbrales de aprobación. R sigue decidiendo qué filas aprobar y qué segmento asignar. Se conserva version_politica de la misma malla, tipo_evaluacion OOT, las 12 columnas y la identidad existente. Sin configuraciones adicionales ni paquetes nuevos. Los cuatro mercados previos y el upsert siguen igual.

La liquidación reutiliza match_id -> eventosLigaProb.idEvent, normalización segura de identificadores, fecha/liga concordantes, goles FT confirmados intHomeScore/intAwayScore y los indicadores/rankings/evolución actuales. BTTS Sí requiere ambos >0; HOME/AWAY comparan goles, empate 1X2 es fallo. Ausentes/no confirmados pendientes y fuera del ROI. HT y BTTS No excluidos. No se utiliza cuotaCombinada para stake individual: los reportes confirman cuotaSimple. Fiabilidad mantiene filtros persistentes y comprueba únicamente que el backend desplegado soporte el mercado.

## Verificación del generador actual

En los dos repositorios accesibles y adjuntos NO se encuentra el R Source original ni Generacion_Malla_Backtest.R ni el CSV consolidado real. Solo hay los helpers R de este PR y los tres generadores Python de reportes aportados. Por ello no se puede afirmar que el generador actual ya produzca o no estos mercados. Es una limitación de acceso al código, no un requisito de reconstruir infraestructura.

Si el objeto malla ya contiene los códigos anteriores, no hace falta cambiar la generación: basta publicar la ampliación de contratos Python/API y usar el flujo habitual. Para inspeccionarlo localmente dentro del R Source existente puede usarse resumir_mercados_malla(malla), sin red ni escrituras. No se exige ejecutar PowerShell ni otro pipeline.

Si faltan esos mercados en la malla, el único cambio R es anexar sus salidas YA APROBADAS de las estrategias existentes antes del mismo write.csv:

```r
# En el R Source actual, no en un flujo alternativo:
malla <- extender_malla_backtest(malla, aprobados_ft)
# Mantener el write.csv actual a bettics_backtest_aprobados.csv.
```

`aprobados_ft` es el objeto de filas de esas estrategias, normalizado a las mismas 12 columnas. Su nombre aquí es ilustrativo: debe conectarse con los objetos reales del generador, no con un CSV extra. La función auxiliar anexa y deduplica identidades idénticas, rechaza conflictos y nunca sobrescribe filas originales. Puede integrarse directamente al archivo R existente.

## Limitaciones puntuales por mercado

| Mercado | Ya comprobado | Solo si el R no lo genera todavía |
|---|---|---|
| Ambos marcan Sí | Semántica valorOpcionApuesta=0.5 y liquidación ambos goles >0 | Localizar objeto aprobado N1–N3 y probabilidades OOT utilizadas por la estrategia; los scripts de reporte mencionan prob_local/prob_visita en prob_modelo_goles_local_oot(_v2).csv y prob_modelo_goles_visita_oot(_v2).csv. No multiplicarlas ni inventar umbrales. |
| Ganador FT Local | Valor 1, HOME, empate fallo | Localizar salidas aprobadas y probabilidad local OOT de la estrategia (prob_modelo_gana_local_oot(_v2).csv o equivalente ya usado por R). |
| Ganador FT Visitante | Valor 2, AWAY, empate fallo | Localizar salidas aprobadas y probabilidad visitante OOT (prob_modelo_gana_visita_oot(_v2).csv o equivalente ya usado por R). |

Ninguno exige recomendaciones_hist.csv. Si una estrategia carece de salida OOT aprobada, solo esa incorporación queda pendiente; los otros mercados pueden continuar. No se exige abrir ni rehacer los CSV OOT si el R ya dispone de esas salidas verificadas. Los scripts de reporte muestran extracción de etiquetas N1–N4, no reglas de aprobación: no se deducen umbrales ni N4 de esas etiquetas.

## Cambios indispensables para completar la carga

1. Incorporar al nodo Python actual las tres entradas nuevas de MARKETS (sin reemplazar el nodo ni alterar URL, lotes, token, DRY_RUN o transporte).
2. Publicar los cambios del módulo backend de este PR mediante Heroku Git/main, conservando APIs existentes, rollback y escrituras false durante validación. El catálogo del modelo y consultas reconoce los tres códigos.
3. Inspeccionar el objeto malla/R Source original: si ya contiene las filas, ninguna modificación R; si faltan, anexar solo las salidas aprobadas que existan con la correspondencia de esta tabla.
4. Utilizar el mismo CSV y endpoint de carga incremental. Antes de una carga real verificar que las nuevas filas proceden de políticas y predicciones OOT originales; no fabricar registros. Mantener DRY_RUN=True y BETTICS_BACKTEST_WRITES_ENABLED=false hasta autorizar la carga.
5. Publicar el frontend compatible para Fiabilidad. No necesita cambiar el diseño ni calcular métricas nuevas: ya usa la misma API de Resultados.

Pruebas automatizadas conservan los cuatro mercados y referencia Bundesliga. Las fórmulas de los tres adjuntos se contrastaron con 18 marcadores de prueba, con hashes y expresiones originales en tests/fixtures/ft-report-contract.json. No son resultados históricos nuevos. Evidencia real previa: docs/backtest-v70-verification.json. No se ejecutó carga, escritura MongoDB ni despliegue; los PR #4 permanecen preparados en borrador.

## Corrección de códigos reales del ETL y publicación

El lote de KNIME usa BTTS_YES, FT_HOME_WIN y FT_AWAY_WIN. Esos son los códigos canónicos de esta entrega; no se reescriben identificadores ni se crean aliases que pudieran duplicar una misma selección. Selecciones YES/HOME/AWAY, FT, linea null. Los cuatro códigos anteriores siguen sin cambios.

Validación local HTTP autenticada: tres mercados por tres segmentos = 9 válidos, HTTP 200, escrituras false, cero llamadas al almacén; registrarMasivo permanece bloqueado HTTP 423. Es una prueba local con fixtures, no una confirmación del endpoint desplegado.

La consulta administrativa a api.heroku.com desde el entorno devolvió 401 y no existe credencial Heroku disponible. No se pudo publicar ni obtener el release activo. scripts/publish-backtest-ft.ps1 prepara el commit portado sobre Heroku main, protege contra sobrescribir cambios del módulo, guarda respaldo y rollback y publica sin force. scripts/verify-ft-live.js usa el token solo dentro del dyno para hacer POST a validarMasivo (9 registros de validación, ninguno almacenado). Si falla la comprobación posterior se revierte al release inicial. No se modifica configuración ni se llama registrarMasivo.

El commit que finalmente se publique en Heroku será el commit portado sobre su main, no necesariamente el SHA del PR. El script registra commit, release, validación y rollback en publicacion.json del respaldo privado. Hasta ejecutar y comprobar ese procedimiento no se afirma que esté publicado.
