param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{40}$')][string]$Candidate,
    [string]$Repository='C:\Proyectos\BetticsHeroku\apianabet'
)
$ErrorActionPreference='Stop'
function Invoke-Bt {
    param([string]$Program)
    & $Program @args
    if($LASTEXITCODE -ne 0){throw "Fallo $Program. No continuar."}
}
function Get-BtRelease {
    $r=@(Invoke-Bt heroku releases -a apianabet -n 1 --json | ConvertFrom-Json)
    if(!$r.Count -or $r[0].status -ne 'succeeded'){throw 'Release no completado.'}
    return $r[0]
}
function Assert-BtWritesDisabled {
    if((Invoke-Bt heroku config:get BETTICS_BACKTEST_WRITES_ENABLED -a apianabet).Trim() -cne 'false'){throw 'Las escrituras deben permanecer false.'}
}
Set-Location $Repository
if(Invoke-Bt git status --porcelain){throw 'Cambios locales pendientes; no se sobrescribiran.'}
$baseline=Get-BtRelease
Assert-BtWritesDisabled
Invoke-Bt git fetch --quiet heroku main
$base=(Invoke-Bt git rev-parse heroku/main).Trim()
Invoke-Bt git fetch --quiet https://github.com/betticsweb/bettics_backend.git $Candidate
$reviewedBase='838813700cf04540e9fd63228461f46d49a28fc0'
Invoke-Bt git fetch --quiet https://github.com/betticsweb/bettics_backend.git $reviewedBase
$existing=@('app/services/backtest/contract.js','app/services/backtest/results.js','app/models/backtestAprobados.js','app/controllers/backtest.js','app/controllers/backtest-results.js')
& git diff --quiet --ignore-space-at-eol $reviewedBase $base -- @existing
if($LASTEXITCODE -ne 0){throw 'El modulo desplegado difiere de la base revisada; no se sobrescribira.'}
$new=@('app/services/backtest/market-policies.js','tests/backtest-market-extension.test.js','tests/backtest-ft-api.test.js','tests/fixtures/ft-report-contract.json')
foreach($file in $new){if(Test-Path $file){throw "Ya existe $file; no se sobrescribira."}}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$backup=Join-Path $env:LOCALAPPDATA "Bettics\Backups\ft-$stamp"
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Invoke-Bt git bundle create "$backup\codigo-previo.bundle" --all
@{release="v$($baseline.version)";commit=$base;candidate=$Candidate} | ConvertTo-Json | Set-Content "$backup\release-previo.json" -Encoding UTF8
"heroku rollback v$($baseline.version) -a apianabet" | Set-Content "$backup\rollback.ps1" -Encoding UTF8
Invoke-Bt git switch -c "release/ft-$stamp" $base
$files=@($existing)+$new
Invoke-Bt git restore "--source=$Candidate" -- @files
foreach($file in @($existing)+@('app/services/backtest/market-policies.js')){Invoke-Bt node --check $file}
if(!(Test-Path node_modules)){Invoke-Bt npm ci --ignore-scripts --no-audit --no-fund}
Invoke-Bt node --test tests/backtest-market-extension.test.js tests/backtest-ft-api.test.js
Invoke-Bt git add -- @files
Invoke-Bt git diff --cached --check
Invoke-Bt git commit -m 'Support KNIME BTTS_YES and FT HOME/AWAY markets without historical writes'
$commit=(Invoke-Bt git rev-parse HEAD).Trim()
# This commit is based on current Heroku main, not GitHub master. No force push.
if((Get-BtRelease).version -ne $baseline.version){throw 'El release cambio; detener antes de publicar.'}
Assert-BtWritesDisabled
Invoke-Bt git push heroku HEAD:main
try {
    $published=Get-BtRelease
    if($published.description -notmatch [regex]::Escape($commit.Substring(0,7))){throw 'Release no confirma el commit.'}
    Invoke-Bt git fetch --quiet heroku main
    if((Invoke-Bt git rev-parse heroku/main).Trim() -ne $commit){throw 'Heroku Git no confirma el commit.'}
    Assert-BtWritesDisabled
    # Token stays inside the dyno. Only POST validarMasivo; no MongoDB writes.
    $js=(Invoke-Bt git show "${Candidate}:scripts/verify-ft-live.js") -join "`n"
    $encoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($js))
    $output=Invoke-Bt heroku run --no-tty --exit-code -a apianabet -- "echo $encoded | base64 -d | node"
    $text=$output -join "`n"
    if($text -notmatch 'BETTICS_FT_VALIDACION=(\{[^\r\n]*\})'){throw 'No se recibio la confirmacion de validarMasivo.'}
    $verification=$Matches[1] | ConvertFrom-Json
    if($verification.http -ne 200 -or $verification.resumen.validos -ne 9 -or $verification.resumen.rechazados -ne 0 -or $verification.escrituras -ne $false){throw 'Validacion FT incorrecta.'}
    foreach($path in @('/api/eventosLiga/getMaestros','/api/recomendaciones/getCriterio','/api/resultados/getCriterio','/api/backtest/resultados')){
        $code=Invoke-Bt curl.exe --silent --show-error --max-time 30 --output NUL --write-out '%{http_code}' "https://apianabet.herokuapp.com$path"
        if($code -ne '401'){throw "Proteccion inesperada en $path : $code"}
    }
    Assert-BtWritesDisabled
    @{release="v$($published.version)";commit=$commit;candidate=$Candidate;validation=$verification;rollback="v$($baseline.version)"} | ConvertTo-Json -Depth 8 | Set-Content "$backup\publicacion.json" -Encoding UTF8
    Write-Host "PUBLICADO: v$($published.version), commit $commit"
    Write-Host 'validarMasivo: HTTP 200, 9 validos, 0 rechazados, escrituras false. No se ejecutaron cargas.'
    Write-Host "Respaldo y comprobante: $backup"
} catch {
    Write-Host "Validacion posterior fallo. Revirtiendo a v$($baseline.version)."
    Invoke-Bt heroku rollback "v$($baseline.version)" -a apianabet
    Assert-BtWritesDisabled
    throw
}
