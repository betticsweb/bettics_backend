# Corrección del cruce histórico de Resultados

Rama `fix/backtest-historical-join`, basada en el PR #2 (código de consultas portado por el propietario a Heroku v68). No es una copia del repositorio Heroku Git. No contiene despliegues, cambios de MongoDB, índices ni ajustes de configuración en producción. El frontend y sus estilos no cambian.

## Lo comprobado y lo que falta comprobar

**Código comprobado:** el lector anterior solo buscaba `eventosLigaProb.idEvent`, exigía fecha/liga literales y requería `strStatus = FT`. El esquema del repositorio de `eventosLigaProb` declara `idEvent`, `intHomeScore`, `intAwayScore`, `cornerKicksHome` y `cornerKicksAway`, pero no `strStatus`. `eventosLiga` declara los marcadores pero no el identificador de partido ni estado. `matchStatistics` declara promedios y probabilidades, no los marcadores individuales: sus agregados no se usan como resultados.

**No comprobado:** el contenido real de las colecciones de Atlas, el campo que contiene los IDs de KNIME en los documentos desplegados, la cobertura real de cruces, los motivos efectivos de los 19,812 pendientes y los porcentajes reales. Tanto la administración de Heroku como la consulta de Resultados responden 401 desde este entorno sin credenciales de lectura. No hay CSV/JSON reales disponibles. Los esquemas del repositorio no se presentan como inspección de documentos MongoDB.

La ausencia de `strStatus` es una causa demostrable en el código, pero no se afirma que sea la única causa de los pendientes reales. Si tampoco hay IDs en los históricos, ningún cambio de tipo resuelve esa ausencia: se necesita una correspondencia autorizada con `match_id`. No se emparejan partidos únicamente por liga/fecha.

## Cruce y consulta

- Por defecto se leen `eventosLigaProb` y `eventosLiga`. Una fuente configurada explícitamente mediante `BETTICS_RESULTS_COLLECTION` se respeta sin añadir otras.
- IDs candidatos `idEvent`, `match_id`, `id`; `BETTICS_RESULTS_ID_FIELD` permite fijar uno explícitamente. Solo se aceptan enteros positivos sin pérdida de precisión; se normalizan cadenas con espacios, ceros iniciales o sufijo decimal cero. Si un documento enlaza varios IDs aprobados diferentes mediante distintas claves, se declara contradictorio.
- Comparación de fecha de calendario/ISO/BSON Date y liga normalizada por espacios, mayúsculas y acentos. No se inventan equivalencias de ligas de distintos países ni conversiones de fechas ambiguas.
- Duplicados equivalentes se coalescen en memoria; pueden aportar campos faltantes. Cada marcador debe proceder de un documento con confirmación final propia; un estado FT de una fila no valida automáticamente valores aportados únicamente por otra fila sin confirmar. Valores de marcador, equipos o estado contradictorios permanecen pendientes. No se escoge el último documento ni se sobrescribe MongoDB.
- Una lectura proyectada en stream por colección, conservando solamente filas enlazadas a IDs aprobados. Evita múltiples escaneos completos si los IDs antiguos no tienen índice o tienen formatos mixtos; no hace una consulta por partido. La caché de 60 segundos se conserva, con una sola carga concurrente.
- Hasta un millón de históricos por fuente y 100 documentos por ID. Si se exceden los límites o falla una lectura se rechaza la consulta completa; no se devuelve una cobertura truncada. Las colecciones inexistentes se leen como vacías. No se crean colecciones mediante modelos ni se ejecutan escrituras.

## Resultados finales y reglas de liquidación

Se consultan `strStatus`, `status`, `statusShort`, `match_status`, `estado` y el campo específico configurado. Valores reconocidos como `FT`, `complete`, `completed`, `finished`, `Match Finished`, `full time` y `finalizado` se normalizan a final. Un estado explícito de prórroga, penales, suspensión, desconocido o contradictorio impide liquidar con los marcadores disponibles. No se suman ni deducen períodos.

Si no hay estado, **no se inventa FT**. Después de confirmar que la fuente contiene marcadores finales reglamentarios, un administrador podrá declarar sus nombres en `BETTICS_RESULTS_FINAL_FIELDS_CONFIRMED` (separados por comas, dentro de las fuentes seleccionadas). No se activa esa declaración en esta entrega. Aun con contrato confirmado, un estado explícito no final y un marcador inválido mantienen el pendiente. Una fecha pasada o un marcador distinto de cero nunca bastan como confirmación.

Ceros válidos se conservan y las cadenas numéricas enteras se convierten estrictamente. Vacíos, null, booleanos, negativos, decimales no enteros y valores no finitos quedan ausentes; jamás se convierten en cero.

Los límites de los cuatro mercados no cambian. Para el empate de `CORNERS_LOCAL_GANA`, `BETTICS_RESULTS_HOME_CORNERS_DRAW_RULE` acepta:

- `pending` (predeterminado): regla no confirmada; pendiente.
- `loss`: mercado con empate perdedor para HOME; −1 unidad.
- `void`: devolución confirmada; ganancia 0, stake neto 0, sin acierto.

Una cuota o un nombre de mercado no permiten distinguir por sí solos entre liquidación a tres vías y devolución. La regla debe confirmarse en el contrato original; aquí no se cambia ninguna configuración de Heroku.

Stake de una unidad para cada acierto/fallo, ganancia `cuota - 1`/`-1`. Efectividad y ROI excluyen pendientes y anulados. Los anulados se cuentan aparte, no se convierten en pendientes ni aciertos. Sin stake evaluado, ROI/efectividad son null. Indicadores, ranking, segmentos, mensual y curva se calculan de las mismas filas liquidadas.

## Cobertura y faltantes concretos, sin cambiar la pantalla

`GET /api/backtest/resultados` añade `conciliacion`; también existe la respuesta parcial autenticada `GET /api/backtest/resultados/conciliacion` a través del registro dinámico de handlers ya existente. Conserva JWT de usuario, caché privada y filtros. No admite parámetros públicos que cambien fuentes, confirmaciones o liquidación.

Incluye:

- cantidad de pronósticos del alcance seleccionado y cruces confirmados;
- motivos de pendiente: sin ID enlazado, metadatos distintos, IDs contradictorios, snapshots incompatibles, final sin confirmar, marcador inválido y empate sin regla;
- cobertura de insumos de todas las versiones OOT en caché, separada explícitamente del alcance filtrado y la versión seleccionada;
- por fuente: filas leídas, coincidencias por cada clave, tipos de campos observados globalmente y en las filas coincidentes, campos necesarios ausentes, presencia de estados y categoría de confirmación;
- en el detalle: nombres exactos de los marcadores faltantes o ejemplos de liga/fecha histórica frente a la esperada.

Estos datos se obtienen automáticamente al leer la fuente, no de los esquemas Mongoose. No se devuelven documentos completos ni valores de credenciales. La inspección se limita a los campos relevantes proyectados; no pretende describir campos arbitrarios fuera de esa proyección.

## Validación obligatoria de Bundesliga: todavía no cerrada

El objetivo original es **última temporada del reporte**, mercado `CORNERS_OVER_85`: 30 aprobados; N1 18 y ROI +19.6%; N2 12 y ROI +29.9%. Son valores esperados exclusivamente para comparar: nunca alimentan los indicadores ni generan resultados artificiales.

El comparador exige la temporada exacta en `temporada`, la liga de Bundesliga correspondiente a los datos, el mercado correcto, todos los segmentos y ninguna restricción parcial de fechas. La versión de política se selecciona por el mecanismo existente. No llama «última temporada» al histórico completo ni elige un año por la fecha actual. Se necesita confirmar la temporada a la que pertenece el reporte original.

`conciliacion.referencia_bundesliga` devuelve `no_comparable`, `incompleto`, `difiere` o `coincide`; expone la temporada, los observados y los esperados. Los ROI observados se comparan redondeados a un decimal. Pendientes, ausencia de filas o anulados impiden afirmar coincidencia.

**No se ha pasado esta comparación con datos reales.** Para cerrarla antes de solicitar despliegue hace falta acceso de lectura o exportaciones sin credenciales de `backtestAprobados` y los históricos, junto al identificador de temporada original. El diagnóstico y las pruebas sintéticas no sustituyen esta evidencia.

## Pruebas

`node --test tests/*.test.js` usa fuentes simuladas para los cambios de esta rama. Cubre normalización de tipos, campos de estado alternativos, confirmación de fuente, duplicados, conflictos, los cuatro mercados, cero/ausentes, liquidación de empates, coherencia entre vistas, límites de lectura, caché, autenticación y separación de temporada de la referencia. La integración MongoDB existente se omite al no disponer de su configuración aislada. No se conecta ni modifica MongoDB de producción.

Resultado local: 56 pruebas aprobadas y una integración MongoDB omitida; cero conexiones o escrituras a la base real. La comparación de Bundesliga real sigue pendiente, no aprobada por los fixtures.
