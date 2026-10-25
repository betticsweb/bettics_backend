# Ampliación FT: estado y fuentes, 2026-10-25

Esta entrega sustituye el alcance anterior: HT queda excluido del contrato, modelo, adaptadores y navegación; BTTS No también queda fuera porque no aparece una estrategia correspondiente en los adjuntos. No se modifican las políticas ni las cifras de los cuatro mercados originales.

## Arquitectura conservada

Madre: DB_Analytic_Bet.backtestAprobados. Resultados: eventosLigaProb, con la lectura adicional existente de eventosLiga. Unión validada match_id -> idEvent, con normalización segura de números/cadenas, fecha y liga concordantes, sin consultas individuales ni tablas nuevas. Goles FT: intHomeScore/intAwayScore y confirmación final existente. Ceros válidos; datos ausentes/contradictorios/no finales pendientes. HOME/AWAY 1X2: empate = fallo. Anulaciones oficiales sin contrato de liquidación confirmado permanecen pendientes. Stake 1, ganancia cuota-1/-1, pendientes fuera del ROI.

## Qué contienen realmente los adjuntos

Los tres .txt contienen scripts Python de generación de reportes, no HTML renderizados ni filas históricas. Leen ONEDRIVE/ProyectoApuestas/BackTest/ResultadosRecomendacionesHist/recomendaciones_hist.csv, ya producido por R. Los SHA-256 de los adjuntos, expresiones originales y casos de prueba están en tests/fixtures/ft-report-contract.json. No se ejecuta el código completo de los adjuntos ni sus escrituras.

| Estrategia | Condición del reporte | Código/selección preparados |
|---|---|---|
| Ambos equipos marcan | valorOpcionApuesta=0.5, ambos goles >0 | AMBOS_MARCAN_SI / YES / FT / linea null |
| Ganador del partido local | valorOpcionApuesta=1, goles local > visitante | GANADOR_FT_LOCAL / HOME / FT / linea null |
| Ganador del partido visitante | valorOpcionApuesta=2, goles visitante > local | GANADOR_FT_VISITANTE / AWAY / FT / linea null |

Los resúmenes calculan ganancia individual con cuotaSimple. Algunos campos auxiliares utilizan cuotaCombinada: NO se utilizan para stake individual. Los scripts extraen N1–N4 de textos y dibujan niveles, pero no aplican los umbrales que originan la aprobación. Eso no verifica N4 ni ninguna condición N1–N3. El alcance nuevo admite exclusivamente N1–N3 que la política original acredite; no se activa ningún segmento por observar su etiqueta.

El tratamiento original de NaN en comparaciones puede producir fallo. No se replica: sin marcador confirmado el backend mantiene pendiente. Los casos comparados son fixtures con marcadores válidos, no evidencia de rentabilidad histórica real adicional.

## Archivos y campos que aún faltan

1. **Generacion_Interfaces**: fuente R de las aprobaciones, condiciones exactas N1/N2/N3 de cada selección, versiones, campos de entrada y origen prepartido de cuotas. No está en los repositorios accesibles ni en los tres adjuntos.
2. **Generacion_Malla_Backtest.R** original: punto de consolidación/write.csv y mapeo de versión/temporada/selección. Se entrega un puente aditivo; no se fabrica un reemplazo del generador original.
3. **recomendaciones_hist.csv**: match_id, liga, mercadoApuesta, opcionApuesta, valorOpcionApuesta, cuotaSimple, fechaJuego (días Unix), equipoLocal/equipoVisitante. No fue adjuntado. Los marcadores homeGoalCount/awayGoalCount del reporte no intervienen en generar aprobados ni se copian a MongoDB.
4. **prob_modelo_goles_local_oot_v2.csv** (alternativa *_oot.csv): match_id, prob_local; **prob_modelo_goles_visita_oot_v2.csv** (alternativa *_oot.csv): match_id, prob_visita. Ambos reportados como fuentes BTTS. No se multiplican sus marginales ni se inventa probabilidad conjunta.
5. **prob_modelo_gana_local_oot_v2.csv** y **prob_modelo_gana_visita_oot_v2.csv** (alternativas sin _v2): match_id y probabilidades. El código acepta prob_local/prob_gana_local/probLocal/probabilidad_local y sus equivalentes prob_visita/prob_gana_visita/probVisita/probabilidad_visita. Faltan los archivos para verificar sus columnas reales.
6. **Trazabilidad temporal OOT**: origen/fold/corte de entrenamiento y momento de predicción/cuota frente al inicio del encuentro. Los scripts no aportan esos metadatos. Nombrar un CSV «oot» no demuestra ausencia de fuga temporal. También falta temporada en el contrato mínimo leído por esos scripts; no se deduce del año.
7. Los **HTML renderizados** mencionados, o sus filas consolidadas, para contrastar conteos/ROI reales adicionales. Los adjuntos actuales permiten verificar fórmulas, no cifras ni aprobaciones.

## Puente R preparado

Cargar extender_malla_backtest.R y preparar_malla_ft.R en el generador original. La secuencia preparada es:

```r
nuevos <- preparar_malla_ft(recomendaciones_hist, evidencia_oot, politicas_verificadas)
malla <- extender_malla_backtest(malla, nuevos, politicas_verificadas)
# Después: el write.csv existente a bettics_backtest_aprobados.csv, sin otro archivo/colección.
```

`evidencia_oot` es un contrato de integración pendiente de mapear desde los originales, NO un archivo encontrado: match_id, mercado, segmento, temporada, version_politica, tipo_evaluacion, aprobado (lógico verdadero de la regla R original), prob_local, prob_visita, cuota, prediccion_en, entrenamiento_hasta, cuota_en, inicio_partido. Las cuatro fechas requieren UTC ISO explícito y entrenamiento anterior a predicción, predicción/cuota anteriores al inicio. Se exige coincidencia de cuotaSimple, identidad y fecha. No se usan goles para decidir aprobaciones. Falta verificar estos datos reales antes de generar o cargar una malla nueva.

Se mantienen 12 columnas y la identidad existente (match_id, mercado, periodo, segmento, version_politica, tipo_evaluacion), carga incremental upsert sin borrar. Repeticiones idénticas no agregan filas; identidades contradictorias se rechazan.

## Estado de publicación y comprobaciones

El manifiesto knime/backtest-market-policies.json sigue vacío a propósito: no declara verificados umbrales que los reportes no contienen. Una entrada futura requiere mercado, versión, familia BTTS/FT_WINNER, selección, linea null, segmentos originales N1–N3, verified y referencia de evidencia; 1X2 drawRule=loss. El backend ya liquida estos FT con goles confirmados y todas las agregaciones existentes; el frontend consulta el catálogo antes de enviar filtros nuevos.

Pruebas de fórmulas extraídas de los tres scripts sobre 18 marcadores de prueba, incluyendo ceros y empates; datos ausentes permanecen pendientes. Se conservan las pruebas de cuatro mercados y referencia Bundesliga. La evidencia real previa está en docs/backtest-v70-verification.json; no se afirma una nueva consulta privada de producción. Pruebas R verifican importación, cuotas, duplicados y rechazo de fuga temporal.

No se ha desplegado ni cargado datos. Mantener Heroku Git/main, el release actual como punto de rollback, BETTICS_BACKTEST_WRITES_ENABLED=false y DRY_RUN=True. Los cambios siguen en PR #4 de backend y frontend; no se publica el master GitHub sobre Heroku ni se usa force. La activación y carga quedan pendientes exclusivamente de comprobar las fuentes anteriores.
