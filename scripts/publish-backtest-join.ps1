param([string]$Repository = 'C:\Proyectos\BetticsHeroku\apianabet')
$ErrorActionPreference = 'Stop'
function Invoke-Bt {
    param([string]$Program)
    & $Program @args
    if ($LASTEXITCODE -ne 0) { throw "Fallo $Program. No continuar." }
}
function Get-BtRelease {
    $items = @(Invoke-Bt heroku releases -a apianabet -n 1 --json | ConvertFrom-Json)
    if (!$items.Count -or $items[0].status -ne 'succeeded') {
        throw 'El ultimo release no esta completado.'
    }
    return $items[0]
}
Set-Location $Repository
if (Invoke-Bt git status --porcelain) { throw 'Hay cambios locales pendientes; no se sobrescribiran.' }
$baseline = Get-BtRelease
if ((Invoke-Bt heroku config:get BETTICS_BACKTEST_WRITES_ENABLED -a apianabet).Trim() -cne 'false') {
    throw 'La escritura debe seguir deshabilitada.'
}
Invoke-Bt git fetch --quiet heroku main
$base = (Invoke-Bt git rev-parse heroku/main).Trim()
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $env:LOCALAPPDATA "Bettics\Backups\cruce-$stamp"
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Invoke-Bt git bundle create "$backup\codigo-previo.bundle" --all
@{ release = "v$($baseline.version)"; commit = $base } | ConvertTo-Json |
    Set-Content "$backup\release-previo.json" -Encoding UTF8
Write-Host "Respaldo: $backup"
Write-Host "Reversion disponible: heroku rollback v$($baseline.version) -a apianabet"

$candidate = '838813700cf04540e9fd63228461f46d49a28fc0'
$reviewedBase = '4ad927d2f633c12226454f940f88c1964ebac32a'
Invoke-Bt git fetch --quiet https://github.com/betticsweb/bettics_backend.git $candidate
$existing = @('app/controllers/backtest-results.js','app/services/backtest/results.js')
# Guard against overwriting changes outside the reviewed Results module.
& git diff --quiet --ignore-space-at-eol $reviewedBase $base -- @existing
if ($LASTEXITCODE -ne 0) {
    throw 'El modulo desplegado difiere de la base revisada del PR #2. No se sobrescribira.'
}
Invoke-Bt git switch -c "release/cruce-$stamp" $base
$newFiles = @('app/services/backtest/history.js','app/services/backtest/reference.js','tests/backtest-history.test.js')
foreach ($file in $newFiles) {
    if (Test-Path $file) { throw "Ya existe $file; no se sobrescribira." }
}
$files = @($existing) + $newFiles + 'tests/backtest-results.test.js'
Invoke-Bt git restore "--source=$candidate" -- @files
foreach ($file in @($existing) + $newFiles) { Invoke-Bt node --check $file }
Invoke-Bt git add -- @files
Invoke-Bt git diff --cached --check
Invoke-Bt git diff --cached --stat
Invoke-Bt git commit -m 'Fix historical Backtest joins and settlement diagnostics'
$commit = (Invoke-Bt git rev-parse HEAD).Trim()
if ((Get-BtRelease).version -ne $baseline.version) { throw 'El release cambio durante la preparacion.' }
if ((Invoke-Bt heroku config:get BETTICS_BACKTEST_WRITES_ENABLED -a apianabet).Trim() -cne 'false') {
    throw 'La escritura ya no esta deshabilitada.'
}
# Heroku Git is the deployment mechanism; no force push or GitHub merge.
Invoke-Bt git push heroku HEAD:main
$published = Get-BtRelease
if ($published.description -notmatch [regex]::Escape($commit.Substring(0,7))) {
    throw 'El release activo no confirma el commit publicado. Consultar el respaldo y releases.'
}
Invoke-Bt git fetch --quiet heroku main
if ((Invoke-Bt git rev-parse heroku/main).Trim() -ne $commit) { throw 'Heroku Git no confirma el commit esperado.' }
if ((Invoke-Bt heroku config:get BETTICS_BACKTEST_WRITES_ENABLED -a apianabet).Trim() -cne 'false') {
    throw 'La proteccion de escritura cambio. Revisar inmediatamente.'
}
foreach ($path in @('/api/eventosLiga/getMaestros','/api/recomendaciones/getCriterio','/api/resultados/getCriterio','/api/backtest/aprobados','/api/backtest/resultados')) {
    $code = Invoke-Bt curl.exe --silent --show-error --max-time 30 --output NUL --write-out '%{http_code}' "https://apianabet.herokuapp.com$path"
    if ($code -ne '401') { throw "Proteccion inesperada en $path : $code" }
}
Write-Host "PUBLICADO: v$($published.version), commit $commit"
Write-Host 'Escrituras del Backtest: false. Falta la revision funcional con tu sesion en la web.'
Write-Host "Rollback: heroku rollback v$($baseline.version) -a apianabet"
