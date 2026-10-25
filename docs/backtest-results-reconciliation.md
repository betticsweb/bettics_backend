# Resultados históricos: conciliación previa

Esta rama depende del módulo de carga del PR #1. No cambia rutas, modelos, ETL, índices ni configuración de producción. La auditoría no liquida pronósticos ni calcula ROI.

## Hallazgos del código (todavía no de los datos reales)

- `eventosLigaProb` declara `idEvent`, goles finales y córners. El cruce candidato es `backtestAprobados.match_id -> eventosLigaProb.idEvent`.
- Ese esquema no declara un estado final del encuentro. Tener goles/córners no demuestra por sí solo que el partido esté finalizado.
- `matchStatistics` contiene probabilidades y promedios, no resultados individuales: no sirve como fuente de liquidación.
- El frontend actual utiliza Render. No debe cambiarse globalmente a Heroku; el servicio de Resultados requerirá una base URL propia y autenticación de lectura confirmada. El token ETL nunca se enviará al navegador.

## Auditoría local, sin cambios en producción

Desde una copia de esta rama que ya tenga las dependencias instaladas, utiliza una cuenta Atlas con rol **read** limitado a `DB_Analytic_Bet`. Configura su URI únicamente en memoria y no la pegues en el chat. No se necesitan permisos de escritura ni cambios en Heroku.

PowerShell:

```powershell
$auditSecret = Read-Host 'URI MongoDB de la cuenta de solo lectura' -AsSecureString
$auditCredential = [System.Net.NetworkCredential]::new('', $auditSecret)
$env:BETTICS_AUDIT_MONGODB_URI = $auditCredential.Password
try {
    node scripts/reconcile-backtest-results.js > conciliacion-backtest.json
    if ($LASTEXITCODE -ne 0) { throw 'La auditoría falló; no usar el informe parcial.' }
} finally {
    Remove-Item Env:BETTICS_AUDIT_MONGODB_URI -ErrorAction SilentlyContinue
    $auditCredential = $null
    $auditSecret = $null
}
```

Comparte solamente `conciliacion-backtest.json`. No contiene URI, credenciales, documentos ni identificadores de partidos. Incluye nombres de base/colecciones, versiones de política, cantidades y tipos de campos.

El script hace una lectura proyectada por colección, sin consultas individuales para cada pronóstico. Limita cada lectura a un millón de documentos; si excede ese máximo, falla sin presentar conclusiones parciales. Usa exclusivamente `listCollections` y `find`; no registra modelos, crea índices ni escribe. Puede consumir recursos de lectura: ejecútalo fuera de los momentos de mayor uso.

## Qué resolver antes de calcular rentabilidad

1. Comprobar cantidad OOT, versiones de política e IDs únicos.
2. Revisar ausencias, IDs históricos duplicados y diferencias de fecha/liga. No elegir arbitrariamente entre duplicados.
3. Confirmar estados finales y reglas para suspendidos/anulados. Si hay campos de estado no incluidos en la auditoría, ampliar su proyección antes de liquidar.
4. Confirmar liquidación del empate en córners para `CORNERS_LOCAL_GANA`: no asumir pérdida o devolución sin la regla aplicable.
5. Seleccionar explícitamente versión de política y evaluación para evitar mezclar snapshots.
6. Proponer índices después de revisar los índices existentes; no crearlos automáticamente con peticiones web.

Las pruebas `node --test tests/backtest-reconciliation.test.js` usan datos simulados y ninguna conexión MongoDB. No constituyen conciliación real.
