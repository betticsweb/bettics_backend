# Backtest Histórico de Bettics

## Estado y alcance

Procedimiento vigente: [publicación controlada sobre v59](backtest-publicacion-v59.md). El usuario acepta continuar sin comparación histórica manual completa. La carga está bloqueada por defecto y exige `BETTICS_BACKTEST_WRITES_ENABLED=true` además de autenticación; no se habilita en esta fase.

Implementación aislada en `feature/backtest-historico`. No se ha desplegado ni enviado un lote real. No modifica los controladores, modelos ni rutas históricas existentes. La colección nueva es exactamente `backtestAprobados`; no se copian marcadores, córners históricos ni estadísticas de otras colecciones.

El CSV aprobado por R tiene exactamente estos campos:

```
match_id,fecha_partido,liga,temporada,mercado,periodo,seleccion,linea,segmento,cuota,version_politica,tipo_evaluacion
```

Las decisiones N1–N4 y la aprobación pertenecen a R. El backend **no vuelve a calcular condiciones de aprobación**. Acepta únicamente ese contrato mediante un endpoint ETL autenticado; no existe un campo `aprobado` ni información suficiente para recalcularlo. El operador ETL es responsable de enviar exclusivamente la salida aprobada.

## Identificación de Heroku: evidencia y límites

- Repositorio candidato/documentado: `betticsweb/bettics_backend`, base `d64c9b169eae3364b0b43f1c70757546f4c3ad9c`.
- `README.md` contiene `heroku git:remote -a apianabet`.
- `package.json` arranca `server.js`. `index.js` es además una entrada para Render; su existencia no prueba qué código ejecuta Heroku.
- `azure-pipelines.yml` se dispara en `main`/`dev`; su etapa de publicación Heroku exige `refs/heads/dev` y usa las variables `HEROKU_APP_ACCESOS` y `HEROKU_Branch_Name`. No hay una publicación declarada para esta rama de feature. `ci-build-api-accesos.yml` tiene `trigger: none`.
- La app `https://apianabet.herokuapp.com` responde desde Express/Heroku. La inspección GET de app identifica `apianabet`, pero builds, releases y configuración devolvieron **401**. El reporte sanitizado está en `backtest-heroku-inspection.json`.
- Por tanto, **no está confirmada la rama/revisión actualmente desplegada ni la conexión MongoDB real de Heroku**. No se presupone un despliegue automático desde GitHub ni equivalencia con Render.

### Cómo comprobar repositorio, rama y método en Heroku

1. En `https://dashboard.heroku.com/apps/apianabet/deploy`, revisar **Deployment method**.
2. Si aparece **GitHub**, revisar el repositorio conectado y la rama en **Automatic deploys** o **Manual deploy**. Consultar la última publicación en **Activity** y comparar su commit con GitHub; la rama seleccionada y el commit desplegado pueden diferir.
3. Si aparece **Heroku Git**, esa pantalla identifica el destino, no el repositorio fuente. Revisar el último build/release de Activity y la canalización que ejecutó el push. En Azure DevOps, comprobar los valores no secretos de `HEROKU_APP_ACCESOS` y `HEROKU_Branch_Name` en los grupos de variables usados por la canalización.
4. Comparar el SHA desplegado con el historial de este repositorio (`git show <SHA>` y `git branch -a --contains <SHA>`). No activar auto-deploy, no hacer push a Heroku ni crear releases para verificarlo.
5. Opcionalmente, ejecutar `python3 scripts/inspect-heroku-source.py` con autenticación de lectura ya disponible. El script solo usa GET y muestra metadatos y presencia de variables; nunca imprime Config Vars, tokens ni URLs firmadas de código fuente. Si necesita `HEROKU_API_KEY`, proporcionarla mediante el mecanismo seguro del entorno, nunca por chat o en un archivo versionado.

## Contrato de carga

`POST https://apianabet.herokuapp.com/api/backtest/registrarMasivo`

Cabeceras: `Content-Type: application/json` y `Authorization: Bearer <BETTICS_ETL_TOKEN>`.

El token ETL debe existir tanto en el entorno seguro de KNIME como en las Config Vars de Heroku. Usar una clave aleatoria de alta entropía (al menos 32 bytes recomendados). No reutilizar un JWT personal. El middleware compara hashes con `timingSafeEqual`, no registra la clave y falla cerrado: 401 para autorización inválida y 503 si falta configuración. Esta clave permite **solo la carga**, no la consulta de usuarios.

Cuerpo: únicamente `{"registros": [...]}`, entre 1 y 250 filas. Reenvío autorizado del mismo lote es seguro. No invocar nunca `/api/eventosLiga/registrarMasivo` para el backtest: esa ruta heredada tiene otra semántica y no forma parte de este módulo.

| Mercado | Selección exacta | Línea | Segmentos |
|---|---|---|---|
| CORNERS_OVER_85 | OVER | 8.5 | N1, N2, N3, N4 |
| CORNERS_UNDER_105 | UNDER | 10.5 | N1, N2, N3, N4 |
| GOLES_OVER_25 | OVER | 2.5 | N1, N2, N3 |
| CORNERS_LOCAL_GANA | HOME | null | N1, N2, N3 |

`HOME` significa más córners del local que del visitante. Se conserva exactamente HOME; no se convierte a LOCAL ni a 1. Para este mercado se normaliza una línea vacía/omitida a null. No se descarta esa recomendación por carecer de umbral numérico.

Validaciones adicionales:

- `match_id`: entero positivo en texto de hasta 32 dígitos. Un número JSON solo se admite si es entero seguro; no se redondean identificadores.
- `fecha_partido`: fecha real de calendario `YYYY-MM-DD`, almacenada como texto ISO para conservar el contrato.
- `liga`: texto no vacío, máximo 200 caracteres; `temporada`: texto no vacío, máximo 32. Se admite un año numérico seguro, convertido a texto.
- `periodo`: FT. No se deducen marcadores de períodos.
- `cuota`: número finito mayor que 1, sin convertir valores ausentes a cero.
- `version_politica` y `tipo_evaluacion`: identificadores de 1 a 100 caracteres alfanuméricos, con `_`, `-` o `.`. Se conservan sus valores: no se inventan versiones ni se reinterpretan etiquetas como OOT/OOS.
- Campos adicionales (incluidas estadísticas o banderas de aprobación ajenas al contrato), mercados desconocidos y segmentos incompatibles se rechazan.

### Identidad, índices y actualizaciones

Índice único `backtest_aprobados_identity_v1`:

```
match_id + mercado + periodo + segmento + version_politica + tipo_evaluacion
```

La selección y la línea están determinadas por el mercado. No forman claves alternativas que permitan duplicar el mismo pronóstico. Liga, temporada, fecha y cuota pueden corregirse mediante upsert sobre la misma identidad. Otra política/evaluación/segmento conserva un registro distinto y auditable; las consultas requieren contexto para no sumar versiones como si fueran pronósticos independientes.

Antes de escribir se establece el índice único y un índice de consulta. Si no es posible, se detiene la carga; nunca se eliminan duplicados preexistentes, documentos, índices ni colecciones para forzar su creación. El esquema desactiva autoCreate/autoIndex: una consulta no crea la colección ni sus índices.

`bulkWrite` usa `updateOne` con `upsert` y una pipeline MongoDB (requiere MongoDB >= 4.2). Un SHA-256 del contenido validado permite conservar `updatedAt` en reenvíos idénticos. `createdAt` se conserva siempre. Los valores de datos se envuelven en `$literal` para evitar su interpretación como expresiones MongoDB.

Duplicados idénticos dentro de un lote se agrupan: una operación y las repeticiones se cuentan como sin cambios. Si una misma identidad presenta contenido distinto dentro del lote, se rechazan **todas** sus apariciones para no elegir arbitrariamente una cuota. Entre lotes, el upsert puede aplicar una corrección legítima. Los conflictos de unicidad causados por cargas concurrentes se reintentan como actualización de la identidad ya existente.

### Respuesta y errores

Ejemplo ilustrativo de un lote completo, no resultado de una carga real:

```json
{
  "estado": "ok",
  "resumen": {
    "recibidos": 224,
    "insertados": 224,
    "actualizados": 0,
    "sin_cambios": 0,
    "rechazados": 0,
    "pendientes": 0,
    "indeterminados": 0
  },
  "rechazos": []
}
```

La suma de insertados, actualizados, sin_cambios, rechazados, pendientes e indeterminados debe igualar recibidos. Los índices de `rechazos` son de base cero y se refieren al lote enviado.

- **200**: todo confirmado; un reenvío puede contener solo sin_cambios.
- **207**: parte del lote fue rechazada; contiene índices y causas, no se considera éxito completo en KNIME.
- **422**: todos los registros fueron rechazados, sin abrir MongoDB.
- **400/413/415**: envoltorio/JSON inválido, más de 250 registros o Content-Type incorrecto.
- **401/503**: fallo de autenticación/configuración, según el caso.
- Fallo de índice/conexión antes de escribir: 503 y registros **pendientes**.
- Fallo de red/write concern con resultado incierto: 503 y registros **indeterminados**. No se inventan cantidades insertadas ni se clasifican como rechazados datos que MongoDB pudo haber escrito. Reenviar el mismo lote permite recuperar un estado confirmado.

No se promete atomicidad de todo el lote. Los errores de escritura individuales confirmados se reflejan como rechazos y se preservan los éxitos del bulk no ordenado. Los errores no exponen cadenas de conexión ni detalles de credenciales.

## Validación sin almacenamiento y bloqueo de cargas

`POST /api/backtest/validarMasivo` usa el mismo contrato y token ETL, responde con `estado: validado`, contadores de validación y `escrituras: false`. No utiliza el modelo ni abre MongoDB, incluso con el gate habilitado. No significa que el lote esté cargado. KNIME conserva DRY_RUN local y no invoca esta ruta automáticamente.

`POST /api/backtest/registrarMasivo` responde 423 `CARGA_DESHABILITADA` cuando `BETTICS_BACKTEST_WRITES_ENABLED` no es exactamente `true`, antes de abrir almacenamiento. Publicar el código o configurar el token no habilita la carga. Esta es una protección adicional al `DRY_RUN=True` del ETL.

## Consulta para la futura web de Resultados

`GET /api/backtest/aprobados?version_politica=BETTICS_20261024_V1&tipo_evaluacion=OOT&page=1&limit=50`

Usa el JWT de usuario existente, **no** el token ETL. Permite filtros opcionales `match_id`, `mercado` y `segmento`; límite máximo 250. Versión y tipo de evaluación son obligatorios. Devuelve total, paginación y los 12 campos del contrato, sin hash ni metadatos internos.

La ruta de lectura usa el mismo modelo, colección y gestor de conexión que la carga. No modifica las APIs existentes de Resultados. Los datos son pronósticos aprobados, **no resultados liquidados**: el cálculo posterior de aciertos/retorno y su vinculación con marcadores históricos están fuera de esta carga y no se inventan.

## MongoDB de Heroku: comprobación pendiente

El gestor existente `app/config/connection.js` construye la conexión con `USR_NAME`, `PSS_WORD`, `CLU` y la base por defecto `DB_Analytic_Bet`. El módulo nuevo reutiliza esa conexión. Este dato del código no confirma qué configuración o código ejecuta Heroku.

Antes de autorizar despliegue/carga:

1. Confirmar independientemente qué base y clúster deben recibir el backtest.
2. Comprobar solo la presencia de las variables; no copiar sus valores al chat.
3. Con autorización operativa, usar el script de auditoría de solo lectura en el contexto real. No necesita que el módulo nuevo esté desplegado: puede ejecutarse por stdin en un dyno que ya tenga el gestor y Mongoose. Ejemplo para el operador, **no ejecutado por esta tarea**:

```sh
heroku run --app apianabet --no-tty "node - DB_Analytic_Bet" < scripts/audit-backtest-environment.js
```

Sustituir el nombre esperado únicamente después de confirmarlo. Iniciar un dyno tiene un efecto operativo y puede tener coste; no hacerlo sin autorización. El script solo consulta versión de MongoDB, nombre de base, existencia de la colección/índice y cantidad de registros. No crea modelos, colecciones, índices ni documentos; no imprime credenciales, URI, host ni registros. Si la colección aún no existe, ese resultado es normal antes de la primera carga autorizada.

La evidencia actual no permite afirmar que la base real sea la correcta. Las pruebas siguientes demuestran la persistencia y lectura en un MongoDB local aislado, no en Heroku.

## KNIME Python Legacy

`knime/backtest_legacy_heroku.py` es un adaptador preparado desde el contrato compartido. **No sustituye una revisión del script Legacy original ni del CSV real, aún no adjuntados.**

- Espera los 12 campos en `input_table_1`; entrega un DataFrame de resumen en `output_table_1`.
- Conserva `DRY_RUN = True` por defecto; no lee el token ni realiza llamadas HTTP en ese modo.
- URL fija Heroku y lotes de 250; nunca apunta a Render ni al endpoint histórico destructivo.
- Conserva IDs como texto, normaliza NaN de HOME a null y serializa con `allow_nan=False`.
- Valida el conjunto completo antes del primer envío y detecta duplicados conflictivos incluso entre lotes.
- En una carga explícitamente autorizada, lee `BETTICS_ETL_TOKEN` del entorno. Verifica todos los contadores y detiene lotes siguientes si hay rechazos/acuse incoherente.
- Reintentos limitados para 429, determinados 5xx y fallos de transporte, siempre con el mismo lote. No reintenta errores de autenticación ni respuestas parciales. No sigue redirecciones que puedan reenviar credenciales y conserva verificación TLS.
- No activar la carga hasta confirmar repositorio/release/DB y revisar los adjuntos reales. No se cambian políticas ni se recalculan condiciones N1–N4.

## Pruebas reproducibles

Node >= 18 para `node:test`; las pruebas actuales se ejecutaron con Node 24. Dependencias de producción sin cambios; el script npm test anterior era un placeholder que fallaba siempre y ahora ejecuta las pruebas existentes y nuevas.

```sh
npm ci
# Solo unidad y pruebas existentes; la integración MongoDB se marcará como omitida:
npm test
```

El siguiente bloque describe pruebas de integración de una fase con escrituras sintéticas autorizadas. **No se ejecuta en esta revisión**, que no conecta a MongoDB. Para una suite completa futura autorizada, iniciar **un MongoDB local vacío y aislado**. Las pruebas rechazan URLs no loopback y usan bases aleatorias `backtest_test_<hex>`. Su limpieza elimina únicamente esas bases sintéticas, nunca una colección de la aplicación. No usar túneles a producción.

```sh
docker run --detach --rm --name bettics-backtest-local-tests --publish 127.0.0.1::27017 mongo:7.0
docker port bettics-backtest-local-tests 27017/tcp
# Sustituir PUERTO por el puerto local mostrado:
BACKTEST_TEST_MONGO_URI=mongodb://127.0.0.1:PUERTO npm test
python3 -m unittest discover -s tests -p 'test_knime_backtest.py' -v
docker stop bettics-backtest-local-tests
```

La imagen utilizada localmente verificó el digest `sha256:c53852c00c23ca9f23fc39690350ffa9a80e3642fe8f96879726d8da0abe80a7`. Para reproducir exactamente puede emplearse `mongo@sha256:...` en lugar de una etiqueta móvil.

Cobertura Node: contrato, segmentos, HOME/null, importación/reenvío/corrección de cuota, índice único real, concurrencia, errores parciales reales de MongoDB, fallos de conexión/acuse, autenticación, lectura con JWT, no mezcla de contextos y auditoría de solo lectura. Conserva las 8 pruebas existentes.

Cobertura Python: DRY_RUN sin red, HOME/NaN/null, lotes de 250, validaciones, contadores, reintentos limitados, fallo seguro y rechazo de redirecciones. Los transportes de carga Python son simulados. El caso de 224 pronósticos/207 partidos usa datos **sintéticos**, no el CSV real del usuario.

## Confirmación posterior del método de despliegue

El usuario confirmó **Heroku Git**, sin integración GitHub directa. Se conserva ese mecanismo. La comparación del release activo y el procedimiento para aislar el patch están en [heroku-git-backtest-release.md](heroku-git-backtest-release.md). La inspección de Config Vars pasó a ser optativa (`--config-presence`); el chequeo de fuente no la necesita.

En la revisión de publicación sobre v59 se ejecuta `npm test` con BACKTEST_TEST_MONGO_URI ausente: los tests MongoDB se marcan omitidos. Las comprobaciones HTTP de seguridad usan almacenamiento falso; las verificaciones de preservación de código y herramientas solo usan archivos y repositorios locales.
