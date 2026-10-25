param(
    [Parameter(Mandatory=$true)][string]$SourceCommit,
    [string]$Repository='C:\Proyectos\BetticsHeroku\apianabet'
)
$ErrorActionPreference='Stop'
Set-Location $Repository
if ($SourceCommit -notmatch '^[0-9a-f]{40}$') { throw 'Revision invalida.' }
function Invoke-Bt {
    param([string]$Program)
    & $Program @args
    if ($LASTEXITCODE -ne 0) { throw "Fallo $Program. No continuar." }
}
$js=(Invoke-Bt git show "${SourceCommit}:scripts/check-backtest-final-source.js") -join "`n"
$payload=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($js))
function Read-BtResult {
    param([switch]$Proposed)
    $command="echo $payload | base64 -d | node -"
    if ($Proposed) { $command+=' --proposed-source' }
    $output=Invoke-Bt heroku run --no-tty --exit-code -a apianabet -- $command | Out-String
    $found=[regex]::Match($output,'BETTICS_FINAL_SOURCE=(\{[^\r\n]*\})')
    if (!$found.Success) { throw 'No se recibio el resultado.' }
    return $found.Groups[1].Value | ConvertFrom-Json
}
function Save-BtReport {
    param($Report,[string]$Name)
    $json=$Report | ConvertTo-Json -Depth 20
    [IO.File]::WriteAllText((Join-Path $backup $Name),$json,[Text.UTF8Encoding]::new($true))
    Set-Clipboard -Value $json
}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$backup=Join-Path $env:LOCALAPPDATA "Bettics\Backups\final-source-$stamp"
New-Item -ItemType Directory -Path $backup -Force | Out-Null
if (([string](Invoke-Bt heroku config:get BETTICS_BACKTEST_WRITES_ENABLED -a apianabet)).Trim() -cne 'false') {
    throw 'Las escrituras deben permanecer deshabilitadas.'
}
$release=@(Invoke-Bt heroku releases -a apianabet -n 1 --json | ConvertFrom-Json)[0]
if ($release.status -ne 'succeeded') { throw 'El release actual no esta completado.' }
$old=([string](Invoke-Bt heroku config:get BETTICS_RESULTS_FINAL_FIELDS_CONFIRMED -a apianabet)).Trim()
if ($old -notmatch '^([A-Za-z][A-Za-z0-9_]*(,[A-Za-z][A-Za-z0-9_]*)*)?$') { throw 'Contrato previo no reconocido.' }
@{release="v$($release.version)";previous_final_sources=$old;writes='false'} | ConvertTo-Json |
    Set-Content (Join-Path $backup 'previous-state.json') -Encoding UTF8
if ($old) {
    $rollback="heroku config:set 'BETTICS_RESULTS_FINAL_FIELDS_CONFIRMED=$old' BETTICS_BACKTEST_WRITES_ENABLED=false -a apianabet"
} else {
    $rollback="heroku config:unset BETTICS_RESULTS_FINAL_FIELDS_CONFIRMED -a apianabet`r`nheroku config:set BETTICS_BACKTEST_WRITES_ENABLED=false -a apianabet"
}
[IO.File]::WriteAllText((Join-Path $backup 'rollback.ps1'),$rollback,[Text.UTF8Encoding]::new($true))
Write-Host 'Verificando marcadores reales y la referencia Bundesliga, sin cambiar produccion...'
$preview=Read-BtResult -Proposed
Save-BtReport $preview 'preflight.json'
if (!$preview.apto_publicar) {
    Write-Host 'NO PUBLICADO: la referencia o los datos no permiten activar la fuente.'
    Write-Host 'El diagnostico esta copiado. Pegalo en el chat con Ctrl+V.'
    return
}
$current=@(Invoke-Bt heroku releases -a apianabet -n 1 --json | ConvertFrom-Json)[0]
if ($current.version -ne $release.version) { throw 'El release cambio durante la comprobacion.' }
Write-Host "Referencia correcta. Se conserva el codigo actual y el rollback de v$($release.version)."
$attempted=$false
try {
    $attempted=$true
    Invoke-Bt heroku config:set BETTICS_RESULTS_FINAL_FIELDS_CONFIRMED=eventosLigaProb BETTICS_BACKTEST_WRITES_ENABLED=false -a apianabet
    $actual=Read-BtResult
    Save-BtReport $actual 'production.json'
    $gainDifference=[Math]::Abs([double]$actual.resumen.ganancia-[double]$preview.resumen.ganancia)
    if (!$actual.apto_publicar -or $actual.resumen.evaluados -ne $preview.resumen.evaluados -or $gainDifference -gt 0.000001) {
        throw 'El resultado activo no coincide con la comprobacion previa.'
    }
    $active=@(Invoke-Bt heroku releases -a apianabet -n 1 --json | ConvertFrom-Json)[0]
    if ($active.status -ne 'succeeded') { throw 'El release nuevo no esta completado.' }
    Write-Host "ACTIVADO: v$($active.version). Escrituras: false. No se modificaron documentos MongoDB."
    $actual.resumen | Format-List
    Write-Host "Respaldo y rollback: $backup"
    Write-Host 'El resultado verificado esta copiado. Pegalo en el chat con Ctrl+V.'
} catch {
    $failure=$_
    if ($attempted) {
        if ($old) {
            Invoke-Bt heroku config:set "BETTICS_RESULTS_FINAL_FIELDS_CONFIRMED=$old" BETTICS_BACKTEST_WRITES_ENABLED=false -a apianabet
        } else {
            Invoke-Bt heroku config:unset BETTICS_RESULTS_FINAL_FIELDS_CONFIRMED -a apianabet
            Invoke-Bt heroku config:set BETTICS_BACKTEST_WRITES_ENABLED=false -a apianabet
        }
        Write-Host 'Se restauro el contrato anterior; las escrituras siguen deshabilitadas.'
    }
    throw $failure
}
