# Publicación preparada por Heroku Git y reversión a v59

## Decisión y límites

El usuario acepta continuar sin la comparación histórica completa de Heroku con GitHub. Esto **no** demuestra que GitHub master y v59 tengan las mismas APIs. Se conserva Heroku Git y el PR #1 en borrador. Esta guía y los comandos están preparados; **no se han ejecutado pasos de publicación, Config Vars, dynos ni escrituras MongoDB**.

Base informada por el operador: release **v59**, commit **332b1fa9fbfa3713bec320a86ef6eaac147ac6bb**. La fuente permanece en `C:\Proyectos\BetticsHeroku\apianabet`; no es accesible desde Codex.

Para minimizar el riesgo sin comparar todo el historial, la publicación se prepara **sobre ese clon v59**, copiando solo el módulo nuevo desde un SHA fijado del PR. No se hace un push directo de `feature/backtest-historico` ni se cambia master. La herramienta comprueba automáticamente la conservación del código previo, manifiestos y lockfile; solo permite el registro aditivo del router y de la colección. Si la arquitectura, dependencias o hooks no son compatibles, se detiene sin adivinar una migración.

Heroku despliega un slug de aplicación completa, no una sola ruta. Los comandos de esta guía no garantizan ausencia absoluta de riesgo. Antes de ejecutar la sección de producción deben aprobarse el SHA final, los resultados locales y las verificaciones mínimas.

## 1. Preparación local y respaldo privado (PowerShell, no despliega)

Usar la sesión Heroku local ya autenticada. No copiar credenciales a comandos, capturas o al PR. Los respaldos pueden contener secretos históricos y deben permanecer privados, fuera de GitHub y de las carpetas que se adjunten al chat.

```powershell
$ErrorActionPreference = 'Stop'
function Assert-BtExit([string]$Step) {
  if ($LASTEXITCODE -ne 0) { throw "Falló: $Step. Detener; no publicar." }
}
$BtApp = 'apianabet'
$BtRoot = 'C:\Proyectos\BetticsHeroku'
$BtClone = Join-Path $BtRoot 'apianabet'
$BtTools = Join-Path $BtRoot 'backtest-pr-source'
$BtV59 = '332b1fa9fbfa3713bec320a86ef6eaac147ac6bb'
$BtBranch = 'release/backtest-v59'
$BtBackup = Join-Path $BtRoot ('respaldo-v59-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $BtBackup | Out-Null

$BtDirty = @(git -C $BtClone status --porcelain)
Assert-BtExit 'estado del clon Heroku'
if ($BtDirty.Count -ne 0) { throw 'El clon tiene cambios: conservarlos y detenerse.' }
$BtHead = (git -C $BtClone rev-parse HEAD).Trim()
Assert-BtExit 'HEAD del clon Heroku'
if ($BtHead -ne $BtV59) { throw 'HEAD ya no es el v59 informado; detenerse.' }

heroku releases --app $BtApp -n 5
Assert-BtExit 'consultar releases'
heroku releases:info v59 --app $BtApp | Out-File (Join-Path $BtBackup 'release-v59.txt')
Assert-BtExit 'respaldar metadatos de v59'
git -C $BtClone bundle create (Join-Path $BtBackup 'heroku-v59.bundle') --all
Assert-BtExit 'respaldar Git privado'
git -C $BtClone bundle verify (Join-Path $BtBackup 'heroku-v59.bundle')
Assert-BtExit 'verificar respaldo Git'
```

**Verificación humana mínima:** confirmar en el listado/panel que el release activo sigue siendo v59 y su SHA es 332b1fa9. Un build o un remoto Git por sí solos no lo demuestran. Si hay otro release/cambio posterior, detenerse y actualizar el plan, no sobrescribirlo.

Respaldar configuración localmente mediante DPAPI de Windows. Este bloque lee Config Vars pero no las modifica. No muestra ni crea un archivo con los valores en texto plano; el respaldo cifrado solo es recuperable por el contexto Windows correspondiente. Conservar acceso al perfil/equipo y mantenerlo privado.

```powershell
$BtConfigJson = (& heroku config --json --app $BtApp | Out-String)
Assert-BtExit 'leer configuración para respaldo privado'
$null = $BtConfigJson | ConvertFrom-Json
$BtConfigJson | ConvertTo-SecureString -AsPlainText -Force |
  ConvertFrom-SecureString |
  Set-Content -Encoding UTF8 (Join-Path $BtBackup 'config-v59.dpapi')
Remove-Variable BtConfigJson
```

Este respaldo no incluye datos de MongoDB. El procedimiento no habilita escrituras del backtest: el gate permanece deshabilitado. Antes de autorizar futuras cargas, confirmar la base real y su política/snapshot de respaldo mediante el proveedor; no se ejecutará una restauración automática ni se asumirá que un rollback de Heroku restaura datos.

## 2. Fijar el candidato y montar solo el módulo sobre v59 (local)

Si `$BtTools` ya existe, usar una carpeta nueva o revisar ese clon; no sobreescribirlo. Puede requerirse autenticación GitHub local, distinta de Heroku.

```powershell
git clone --single-branch --branch feature/backtest-historico https://github.com/betticsweb/bettics_backend.git $BtTools
Assert-BtExit 'obtener PR'
$BtCandidate = (git -C $BtTools rev-parse HEAD).Trim()
Assert-BtExit 'fijar SHA del candidato'
$BtCandidate | Set-Content (Join-Path $BtBackup 'candidate-sha.txt')
git -C $BtTools show --stat --oneline $BtCandidate
Assert-BtExit 'revisar candidato'

$BtPrepare = Join-Path $BtTools 'scripts\prepare-backtest-release.py'
git -C $BtClone switch --create $BtBranch $BtV59
Assert-BtExit 'crear rama local desde v59'
py -3 $BtPrepare prepare --target $BtClone --base $BtV59 --candidate-repo $BtTools --candidate $BtCandidate |
  Tee-Object -FilePath (Join-Path $BtBackup 'preparacion-v59.json')
Assert-BtExit 'aplicar módulo aditivo'
```

El preparado conserva los archivos previos y no copia package.json, dependencias, lockfile, Procfile ni cambios anteriores de GitHub. Copia ocho archivos runtime del módulo, pruebas conocidas y el adaptador; añade únicamente tres líneas de integración al servidor y una constante de colección. No ejecuta npm, hooks, commits, red ni MongoDB. Se detiene por conflictos, rutas preexistentes, arquitectura no reconocida, Mongoose fuera de 6.x, Express fuera de 4.x o hooks automáticos no revisados. Un `build` trivial conocido se permite; otros builds requieren revisión enfocada. Los fallos no se fuerzan ni se resuelven con un reemplazo global del backend.

No usar `--allow-test-script-change` al preparar/publicar v59. Esa opción existe exclusivamente para verificar el PR GitHub, cuyo script de pruebas reemplazó un placeholder; no autoriza cambios del manifiesto de producción.

## 3. Verificaciones locales sin MongoDB

Usar Node >=18 para `node:test` y un Python con pandas para las pruebas de KNIME. Confirmar también la versión Node del release/build de Heroku; no asumir que coincide con la local. Si el manifiesto no fija runtime o se necesita actualizar versiones, detenerse y aprobar ese cambio separadamente. No ejecutar `npm update`, scripts desconocidos ni `npm start` con un `.env` de producción.

```powershell
Push-Location $BtClone
try {
  node -e "if (Number(process.versions.node.split('.')[0]) < 18) process.exit(1)"
  Assert-BtExit 'versión local Node'
  npm ci --ignore-scripts --no-audit --no-fund
  Assert-BtExit 'instalación congelada sin hooks'
  node --check server.js
  Assert-BtExit 'sintaxis de arranque'
  node --test tests/backtest-contract.test.js tests/backtest-safety.test.js
  Assert-BtExit 'pruebas sin MongoDB'
  py -3 -m unittest discover -s tests -p test_knime_backtest.py -v
  Assert-BtExit 'adaptador KNIME en pruebas simuladas'
} finally { Pop-Location }

py -3 $BtPrepare verify --target $BtClone --base $BtV59 --candidate-repo $BtTools --candidate $BtCandidate |
  Tee-Object -FilePath (Join-Path $BtBackup 'preservacion-v59.json')
Assert-BtExit 'conservar APIs y dependencias de v59'
git -C $BtClone diff --check
Assert-BtExit 'integridad del patch'
git -C $BtClone diff --stat
```

La herramienta exige igualdad de los archivos fuente anteriores (normalizando solo CRLF) salvo las cuatro líneas aditivas. Además verifica que cada archivo nuevo sea el del candidato fijado. Esto acredita preservación del código contra **tu base v59 local** sin requerir una comparación manual completa de su historia. No prueba el comportamiento de terceros ni una base distinta de la indicada.

Las pruebas incluidas en este bloque usan almacenamiento falso y transporte local/simulado, no MongoDB. La integración con MongoDB local fue probada en una fase anterior; en esta revisión no se repitió por la instrucción de no escribir sobre MongoDB. No se afirmará que las pruebas actuales validan los datos o la conexión real de Heroku.

## 4. Baseline GET actual y commit local revisable

Capturar el baseline inmediatamente antes de publicar, no reutilizar como prueba actual un reporte antiguo. El probe solo usa GET sin credenciales en rutas protegidas y nunca llama al endpoint histórico masivo. No sustituye una prueba funcional autenticada.

```powershell
$BtProbe = Join-Path $BtTools 'scripts\probe-legacy-api.py'
py -3 $BtProbe capture --output (Join-Path $BtBackup 'http-before.json')
Assert-BtExit 'baseline GET de APIs existentes'

$BtPaths = @(
  'server.js', 'app/config/constantes.js',
  'app/models/backtestAprobados.js', 'app/controllers/backtest.js', 'app/routes/backtest.js',
  'app/middleware/backtest-etl-auth.js', 'app/middleware/backtest-write-gate.js',
  'app/services/backtest/contract.js', 'app/services/backtest/ingest.js', 'app/services/backtest/store.js',
  'tests/backtest-api.test.js', 'tests/backtest-contract.test.js', 'tests/backtest-safety.test.js',
  'tests/helpers/backtest-fixture.js', 'tests/test_knime_backtest.py',
  'knime/backtest_legacy_heroku.py', 'scripts/audit-backtest-environment.js'
)
git -C $BtClone add -- $BtPaths
Assert-BtExit 'preparar únicamente el patch previsto'
git -C $BtClone diff --cached --stat
Assert-BtExit 'revisar archivos preparados'
git -C $BtClone commit -m 'Add isolated Backtest API with writes disabled by default'
Assert-BtExit 'crear commit local de publicación'
$BtReleaseCommit = (git -C $BtClone rev-parse HEAD).Trim()
Assert-BtExit 'SHA del commit local'
git -C $BtClone merge-base --is-ancestor $BtV59 $BtReleaseCommit
Assert-BtExit 'publicación descendiente de v59'
$BtReleaseCommit | Set-Content (Join-Path $BtBackup 'release-commit.txt')
py -3 $BtPrepare verify --target $BtClone --base $BtV59 --candidate-repo $BtTools --candidate $BtCandidate
Assert-BtExit 'verificación final del commit local'
```

**Punto de autorización:** presentar candidato GitHub, commit local de publicación, reportes de pruebas/preservación y baseline. Aquí se detiene el procedimiento hasta obtener autorización explícita. El PR #1 permanece en borrador y no se fusiona con master.

## 5. Publicación: comandos preparados, NO ejecutados, requieren autorización

No hacer push de la rama GitHub completa ni usar `--force`. El commit local se basó en la historia de Heroku, así que puede publicarse por fast-forward. Identificar automáticamente la referencia existente main/master que apunta a v59; si es ambigua o cambió, detenerse.

```powershell
# Ejecutar SOLO tras autorizar este commit y las verificaciones anteriores.
# Volver a confirmar que el release activo es v59 antes del primer cambio.
heroku releases --app $BtApp -n 5
Assert-BtExit 'reconfirmar release previo'
$BtRemote = 'https://git.heroku.com/apianabet.git'
$BtRefs = @(git -C $BtClone ls-remote --heads $BtRemote refs/heads/main refs/heads/master)
Assert-BtExit 'comprobar referencia remota'
$BtMatches = @($BtRefs | Where-Object { ($_ -split '\s+')[0] -eq $BtV59 })
if ($BtMatches.Count -ne 1) { throw 'Referencia remota ambigua o cambiada: no publicar.' }
$BtTargetRef = ($BtMatches[0] -split '\s+')[1]

# Este cambio de Config Vars crea un release/reinicio: también requiere autorización.
heroku config:set BETTICS_BACKTEST_WRITES_ENABLED=false --app $BtApp
Assert-BtExit 'bloquear escrituras antes de publicar código'
$BtGate = (heroku config:get BETTICS_BACKTEST_WRITES_ENABLED --app $BtApp | Out-String).Trim()
Assert-BtExit 'comprobar bloqueo'
if ($BtGate -ne 'false') { throw 'No se confirmó el bloqueo de escrituras.' }

git -C $BtClone push $BtRemote "${BtReleaseCommit}:$BtTargetRef"
Assert-BtExit 'publicar por Heroku Git sin force'
heroku releases --app $BtApp -n 5
Assert-BtExit 'comprobar releases'
heroku releases:info --app $BtApp
Assert-BtExit 'comprobar release resultante'
heroku ps --app $BtApp
Assert-BtExit 'comprobar estado del proceso'
```

Confirmar que el release exitoso ejecuta `$BtReleaseCommit`; no basta con que el push termine. Las Config Vars crean releases adicionales, por eso el nuevo número no se fija de antemano. Revisar el estado de los procesos y, si hay errores, los logs localmente sin compartir credenciales ni registros sensibles.

No habilitar `BETTICS_BACKTEST_WRITES_ENABLED=true`. La API de importación está bloqueada también por defecto cuando la variable falta. El token `BETTICS_ETL_TOKEN`, si aún falta, se configura mediante la UI segura de Heroku **solo en el momento autorizado**; no se pone su valor en el historial de PowerShell. Configurarlo no autoriza una carga.

## 6. Smoke tests posteriores sin escritura MongoDB

```powershell
py -3 $BtProbe compare --baseline (Join-Path $BtBackup 'http-before.json') --output (Join-Path $BtBackup 'http-after.json')
Assert-BtExit 'APIs GET mantienen las barreras de autenticación'
```

Los cuatro GET deben seguir respondiendo 401 sin token. Para validar funciones con datos, un operador autenticado debe revisar las consultas GET habituales y las pantallas existentes con su sesión; estas verificaciones no ejecutan cargas ni mutaciones. No usar POST de login como prueba de carga, y **nunca** usar `POST /api/eventosLiga/registrarMasivo` como smoke test: la ruta heredada tiene semántica destructiva.

Después de que el token ETL esté configurado de manera autorizada y disponible en una variable de entorno local (no literal en el comando), se pueden validar dos registros sintéticos. La ruta de validación no abre almacenamiento, incluso si el gate estuviera habilitado:

```powershell
if (-not $env:BETTICS_ETL_TOKEN) { throw 'Falta el token ETL seguro para esta verificación autorizada.' }
$BtHeaders = @{ Authorization = 'Bearer ' + $env:BETTICS_ETL_TOKEN }
$BtSample = @{
  match_id='999999990001'; fecha_partido='2025-07-01'; liga='BACKTEST_SMOKE_NO_DATOS'; temporada='2025';
  mercado='CORNERS_OVER_85'; periodo='FT'; seleccion='OVER'; linea=8.5; segmento='N1'; cuota=1.25;
  version_politica='SMOKE_NO_CARGA'; tipo_evaluacion='OOT'
}
$BtHome = $BtSample.Clone()
$BtHome.match_id='999999990002'; $BtHome.mercado='CORNERS_LOCAL_GANA'; $BtHome.seleccion='HOME'; $BtHome.linea=$null
$BtBody = @{registros=@($BtSample,$BtHome)} | ConvertTo-Json -Depth 5
$BtValidation = Invoke-RestMethod -Method Post -Uri 'https://apianabet.herokuapp.com/api/backtest/validarMasivo' -ContentType 'application/json' -Headers $BtHeaders -Body $BtBody
if ($BtValidation.estado -ne 'validado' -or $BtValidation.escrituras -ne $false -or $BtValidation.resumen.validos -ne 2) { throw 'Validación del módulo no confirmada.' }
Remove-Variable BtHeaders,BtBody
```

Este POST solo se ejecuta después del despliegue autorizado y contra la ruta nueva de validación. No se enviarán CSV reales ni se cambiará `DRY_RUN=True` de KNIME. La habilitación de carga y la creación de la colección/índices son una autorización separada.

## 7. Reversión preparada a v59: NO ejecutada

Ante un fallo tras publicar, el operador debe tener autorización para ejecutar la reversión. No esperar una carga real para comprobar el nuevo módulo.

```powershell
heroku releases:rollback v59 --app apianabet
Assert-BtExit 'revertir código/configuración al release v59'
heroku releases --app apianabet -n 5
Assert-BtExit 'comprobar release de reversión'
heroku releases:info --app apianabet
Assert-BtExit 'comprobar slug tras reversión'
py -3 $BtProbe compare --baseline (Join-Path $BtBackup 'http-before.json') --output (Join-Path $BtBackup 'http-rollback.json')
Assert-BtExit 'comprobar APIs tras reversión'
```

El rollback crea un release nuevo que reutiliza la versión v59; no cambia el número histórico v59 ni restaura documentos de MongoDB. Comprobar el commit/slug 332b1fa9 y la configuración resultante contra el respaldo privado. No aplicar una restauración ciega de Config Vars ni ejecutar `mongorestore`, `deleteMany`, un reset remoto o un push forzado. Heroku Git puede conservar la referencia del último código enviado aunque la app ejecute el slug revertido: una futura publicación debe volver a comprobar release y repositorio por separado.

## Evidencia de esta revisión

Se ejecutaron pruebas unitarias/HTTP con almacenamiento falso y herramientas locales, y cuatro GET sin credenciales al servicio actual. No se ejecutó el montaje sobre Windows, un despliegue, rollback, cambio de Config Vars, dyno de auditoría ni operación MongoDB. La verificación de código del PR se refiere explícitamente a la base GitHub d64c9b1, no a una comparación histórica completa con v59.
