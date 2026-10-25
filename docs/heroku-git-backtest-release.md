# Comparación y preparación de una publicación por Heroku Git

**Actualización:** el usuario acepta continuar sin comparación histórica completa. El procedimiento vigente, con portado aditivo sobre v59, respaldo, gate deshabilitado y rollback exacto, está en [backtest-publicacion-v59.md](backtest-publicacion-v59.md). No se requiere ahora enviar un ZIP como condición para continuar. Las secciones siguientes conservan el procedimiento de comparación opcional anterior.

## Estado confirmado y pendientes

El usuario confirmó en Heroku que `apianabet` usa **Heroku Git**, sin GitHub conectado directamente. Se conserva ese mecanismo. Esto identifica el destino, pero no demuestra qué repositorio fuente, revisión o rama produjo el release activo.

El PR #1 permanece en borrador en `feature/backtest-historico`. `master` no se modifica. La base de GitHub al preparar el módulo es `d64c9b169eae3364b0b43f1c70757546f4c3ad9c`; ese SHA no se presupone desplegado en Heroku.

No se han ejecutado comandos de deploy, creado releases/dynos ni realizado operaciones en MongoDB de producción. La inspección administrativa sigue pendiente por falta de autenticación; el resultado anterior está en `backtest-heroku-inspection.json`.

## Accesos necesarios

**Opción preferida, sin compartir credenciales:** un operador ya autenticado en Heroku obtiene la evidencia del release activo y compara el código localmente. Comparte solo el informe sanitizado, versión del release y SHA. No enviar Config Vars, `.env`, cookies, tokens, URLs firmadas de descarga ni un slug completo sin sanear.

**Si Codex realizará directamente las lecturas:** hace falta una credencial de Heroku que permita consultar app, releases y slugs/builds de `apianabet`, con permisos de lectura y acceso mínimo que permita el plan/cuenta. Si se usa OAuth, solicitar scope de lectura; un API key personal puede tener permisos más amplios y no debe describirse como limitado a una sola app. Guardarlo como secreto personal `HEROKU_API_KEY` mediante los ajustes seguros del entorno, destinado únicamente a `api.heroku.com`, nunca en chat, PR, archivo ni argumento de comando. Configurar esa credencial no autoriza su uso para desplegar.

Para esta comparación no hace falta el token ETL, una contraseña MongoDB ni permiso de escritura en MongoDB. La lectura de Config Vars no es necesaria: `inspect-heroku-source.py` ya no la solicita por defecto. La opción `--config-presence` es explícita y solo publica presencia de nombres, para una comprobación posterior de configuración.

La disponibilidad de una credencial no elimina la necesidad de obtener el código de la revisión activa: si el commit ya existe en GitHub se puede comparar su árbol; si no, se necesita una copia confiable de esa fuente/slug o acceso de lectura al repositorio Heroku Git. Para descargar un artefacto se habilitará únicamente el host HTTPS exacto que devuelva Heroku; nunca se enviará el token Bearer de la API a un host de almacenamiento o a una redirección.

## Comparación segura, antes de preparar una rama de publicación

1. En **Heroku → apianabet → Activity**, identificar el **release activo**, su versión, fecha, slug y commit. No usar como sustituto el último build, el release de mayor número si falló, ni el HEAD del remoto. Un rollback puede dejar activo un slug de un commit anterior.
2. Con una sesión local ya autenticada, `heroku git:clone -a apianabet /ruta/temporal/apianabet-source` es una lectura del repositorio, no un deploy. Comparar su SHA con el release activo. Si el remoto está vacío, no conserva ese commit o el SHA no coincide, detenerse y obtener la fuente de esa revisión desde un artefacto confiable. No corregirlo con un push ni resetear el remoto.
3. En ese clon temporal, materializar únicamente el commit identificado como activo. No usar el directorio de una aplicación en ejecución para hacer checkout. Mantener el snapshot privado; los slugs pueden contener dependencias y archivos sensibles.
4. Ejecutar el comparador **offline** contra la revisión de GitHub correspondiente. Ejemplo de lectura; sustituir las rutas y el SHA por la evidencia real:

```sh
python3 scripts/compare-deployed-source.py \
  --repo /ruta/al/clon/bettics_backend \
  --ref d64c9b169eae3364b0b43f1c70757546f4c3ad9c \
  --deployed /ruta/temporal/apianabet-source \
  --release-commit SHA_COMPLETO_DEL_RELEASE_ACTIVO
```

El comparador no hace fetch/checkout, no ejecuta el código, no se conecta a servicios y no escribe. Compara hashes de entrypoints Node, manifiestos, Procfile y código/plantillas de `app`; excluye `.env`, carpetas ocultas, dependencias y salidas de build de la raíz. Rechaza enlaces simbólicos/archivos excesivos y devuelve diferencias, faltantes y extras, sin contenidos. Una copia incompleta no se trata como coincidente.

`scoped_files_identical` no prueba por sí solo la procedencia del snapshot. `snapshot_provenance_verified_by_script` permanece false deliberadamente: la procedencia se acredita con el release/slug/commit obtenido del panel o API. `release_commit_matches_reference` registra si el SHA aportado coincide con la revisión comparada.

Si los SHA difieren pero los archivos coinciden, documentar que el contenido comparado coincide, sin afirmar que comparten historial Git. Si hay diferencias, revisar solo archivos de código pertinentes y sin secretos. No trasladar automáticamente al Heroku actual los cambios de Render, estadísticas, dependencias o configuración que existan únicamente en GitHub.

La inspección `python3 scripts/inspect-heroku-source.py` es GET-only y no imprime URLs firmadas. Si la API no proporciona un único release marcado como activo, informa `current_release_verified: false` y requiere comprobación en el panel; no adivina que el último release es el vigente.

## Qué significa publicar «solo la API nueva»

Heroku Git compila y publica **la aplicación completa**. No existe un push que instale únicamente una ruta HTTP. El aislamiento se consigue en el contenido del cambio:

1. Después de confirmar la fuente, preparar una rama de publicación independiente desde el commit que está activo en Heroku, conservando su código y manifiestos.
2. Aplicar solamente el módulo backtest: archivos nuevos bajo `app/services/backtest`, modelo, controlador, autenticación y ruta; registro aditivo en `server.js` y en `SchemaName`. Conservar todos los registros de rutas y controladores previos.
3. No trasladar commits previos de GitHub indiscriminadamente. El commit del módulo se basó en `d64c9b1`; un cherry-pick ciego sobre otra base no acredita compatibilidad. Si es necesario, portar el patch y revisar cada diferencia contra el commit activo.
4. La dependencia Mongoose/Express existente debe ser compatible; el módulo no añade dependencias de producción. Verificar runtime Node y MongoDB >= 4.2 para updates por pipeline. No cambiar versiones globales ni ejecutar `npm update` como parte del portado.
5. Ejecutar nuevamente las pruebas existentes y del módulo contra MongoDB local aislado. Revisar el diff final contra la base real y los archivos de arranque/Procfile/scripts de instalación, buscando cambios ajenos, tareas de release o migraciones automáticas.
6. Revisar cualquier release phase/build hook: puede ejecutar tareas aunque no se haga una carga ETL. Ninguna parte del procedimiento debe escribir en MongoDB de producción antes de la autorización correspondiente.
7. Preparar la referencia de rollback (release y slug previos), el patch exacto, los resultados y el plan de smoke tests para aprobación. Mantener el PR #1 en borrador y no fusionarlo con `master`.

### Solo después de autorización explícita, no ejecutado

El deploy futuro mantendrá Heroku Git y publicará la **rama aislada revisada**, no `master` ni una rama que arrastre diferencias no aprobadas. No se incluye un comando listo con `git push -f`: no se necesita forzar historia ni se deben usar claves dentro de URLs.

El token `BETTICS_ETL_TOKEN` se configurará de forma segura en el momento autorizado. La comprobación inicial del endpoint no enviará pronósticos reales. Una carga de backtest, la creación de su colección/índices y cualquier cambio de Config Vars son pasos distintos y requieren autorización. Se mantiene `DRY_RUN=True`; no se llamará al endpoint histórico `eventosLiga/registrarMasivo`.

La auditoría MongoDB de `backtest-historico.md` es de solo lectura, pero usar un dyno/ejecutar comandos en producción tampoco forma parte de esta fase. No se ejecutará sin autorización operativa adicional.

## Validación de las herramientas

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

Incluye la suite del adaptador Legacy (transporte simulado) y pruebas de comparación con repositorios locales sintéticos: diferencias, snapshots incompletos, secretos excluidos, symlinks rechazados y SHA divergentes. Las pruebas de inspección no llaman a Heroku: simulan releases fallidos/activos y comprueban que credenciales y URLs firmadas no aparezcan en el informe.

## Evidencia aportada por el usuario: v59

El usuario comprobó localmente el release activo **v59**, `Deploy 332b1fa9`, fechado 2025-12-07, y confirmó que el clon Heroku Git tiene HEAD `332b1fa9fbfa3713bec320a86ef6eaac147ac6bb`. La copia local está en `C:\Proyectos\BetticsHeroku\apianabet`.

Este entorno no puede acceder a esa ruta de Windows. El objeto 332b1fa9 tampoco está disponible en el historial accesible del repositorio GitHub: `git fetch origin <SHA>` devolvió `not our ref`, y la consulta de commit devolvió 422. Por tanto, todavía no se ha comparado su código ni certificado la conservación de endpoints. Esta evidencia no se sustituye por un checkout de GitHub master.

### Compartir una copia seleccionada y revisada del código

Descargar `scripts/export-heroku-source.py` desde esta rama a una carpeta fuera del repositorio Heroku, por ejemplo `C:\Proyectos\BetticsHeroku\herramientas\`. Basta este archivo Python; no usa módulos de terceros ni importa el backend.

Desde PowerShell (Python y Git instalados):

```powershell
py -3 "C:\Proyectos\BetticsHeroku\herramientas\export-heroku-source.py" --repo "C:\Proyectos\BetticsHeroku\apianabet" --commit 332b1fa9fbfa3713bec320a86ef6eaac147ac6bb --release v59 --output "$env:USERPROFILE\Downloads\apianabet-v59-codigo.zip"
```

Si el lanzador `py` no existe, usar el ejecutable Python correspondiente. El ZIP no se sobrescribe si ya existe; escoger otro nombre antes de reintentar.

El exportador lee blobs de **ese commit**, no cambios locales ni archivos sin versionar. Incluye código/plantillas de `app`, entrypoints Node, manifiestos y Procfile. Excluye `.git`, `.env`, carpetas ocultas, node_modules, certificados/claves y nombres de archivos asociados a credenciales. El manifiesto contiene el commit declarado, inventario y hashes de los archivos compartidos, más los archivos excluidos/reemplazados. No contiene historial Git ni valores de archivos excluidos.

Los secretos también pueden estar incrustados en archivos `.js` o `.json`. Se bloquea la creación si se detectan patrones como contraseñas literales, tokens, URLs con usuario/contraseña o claves privadas. **Es una comprobación heurística, no una garantía:** revisar manualmente el contenido antes de adjuntar el ZIP. No compartir un ZIP completo del clon, `.git` ni un `git bundle`: podrían incluir secretos actuales o históricos.

Si se bloquea un archivo, el mensaje indica únicamente su ruta, sin imprimir valores. No borrar credenciales ni editar el repositorio original para exportarlo: crear una copia separada, por ejemplo `C:\Proyectos\BetticsHeroku\sanitizado\app\config\connection.js`, y reemplazar únicamente los valores sensibles por `REDACTED_FOR_SHARING`, preservando estructura, nombres de variables y código. Después repetir el comando con:

```powershell
--sanitized "C:\Proyectos\BetticsHeroku\sanitizado"
```

Ese argumento se agrega al comando completo anterior. Las rutas dentro de la copia sanitizada deben coincidir con las del repositorio. Todos los reemplazos quedan marcados en el manifiesto: sus archivos no se consideran idénticos al original ni se usan para afirmar coincidencia byte a byte. Si no es posible sanear un archivo sin exponer información, compartir primero solo el inventario y comunicar qué ruta quedó pendiente, sin su contenido.

### Trabajo tras recibir la copia

1. Verificar el manifiesto y el SHA aportado; inspeccionar el archivo sin ejecutar scripts del backend ni instalar sus dependencias.
2. Comparar v59 con la base GitHub `d64c9b1` y, por separado, con `feature/backtest-historico`. Separar diferencias previas del delta del módulo para no introducir cambios ajenos al desplegar.
3. Inventariar métodos, paths, montajes de routers, middlewares y controladores existentes; revisar también conexión, manifiestos, Procfile y hooks de build/release. Las rutas calculadas dinámicamente requieren revisión manual: una búsqueda textual no acredita cobertura completa.
4. Preparar un informe de endpoints preservados/cambiados/pendientes y un patch de backtest sobre la fuente v59. Los archivos excluidos o saneados quedarán expresamente pendientes de la comprobación que corresponda.
5. Probar el portado con datos sintéticos y MongoDB local aislado, conservando las APIs existentes. Mantener el PR en borrador y solicitar autorización únicamente cuando el cambio concreto y el procedimiento final sean revisables.

No es necesario compartir credenciales Heroku o MongoDB para enviar esta copia seleccionada. Este procedimiento no implica despliegue, checkout en el clon del usuario ni operación alguna sobre MongoDB.
