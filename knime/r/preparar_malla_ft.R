# Puente para recomendaciones_hist.csv, NO motor de aprobación N1-N3.
# La evidencia OOT debe producirla el generador original con sus reglas verificadas.
# No lee marcadores ni escribe CSV/MongoDB. Usar extender_malla_backtest después.
preparar_malla_ft <- function(recomendaciones, evidencia_oot, politicas_verificadas) {
  campos <- c('match_id','fecha_partido','liga','temporada','mercado','periodo',
              'seleccion','linea','segmento','cuota','version_politica','tipo_evaluacion')
  requeridos <- c('match_id','liga','mercadoApuesta','valorOpcionApuesta','cuotaSimple','fechaJuego')
  auditoria <- c('match_id','mercado','segmento','temporada','version_politica',
                'tipo_evaluacion','aprobado','prob_local','prob_visita','cuota',
                'prediccion_en','entrenamiento_hasta','cuota_en','inicio_partido')
  if (!all(requeridos %in% names(recomendaciones))) stop('Faltan columnas de recomendaciones_hist.csv')
  if (!all(auditoria %in% names(evidencia_oot))) stop('Falta evidencia OOT, aprobacion o procedencia temporal')
  if (!is.character(recomendaciones$match_id) || !is.character(evidencia_oot$match_id) ||
      anyNA(recomendaciones$match_id) || anyNA(evidencia_oot$match_id) ||
      any(!grepl('^[1-9][0-9]{0,31}$', recomendaciones$match_id)) ||
      any(!grepl('^[1-9][0-9]{0,31}$', evidencia_oot$match_id)))
    stop('match_id debe conservarse como texto entero positivo, sin conversion numerica')
  if (!length(politicas_verificadas)) stop('Faltan reglas originales verificadas')
  tipos <- c('AMBOS_MARCAN_SI','GANADOR_FT_LOCAL','GANADOR_FT_VISITANTE')
  seleccion <- c('YES','HOME','AWAY')
  salida <- list()
  for (i in seq_len(nrow(recomendaciones))) {
    r <- recomendaciones[i,,drop=FALSE]
    nombre <- trimws(gsub('\\s*\\(N[1-3]V?\\)', '', as.character(r$mercadoApuesta), perl=TRUE))
    valor <- suppressWarnings(as.numeric(as.character(r$valorOpcionApuesta)))
    codigo <- if (nombre == 'Ambos equipos marcan' && !is.na(valor) && valor == 0.5) tipos[1] else
              if (nombre == 'Ganador del partido' && !is.na(valor) && valor == 1) tipos[2] else
              if (nombre == 'Ganador del partido' && !is.na(valor) && valor == 2) tipos[3] else NA_character_
    if (is.na(codigo)) next # HT, BTTS No y otros mercados quedan fuera.
    niveles <- regmatches(as.character(r$mercadoApuesta), gregexpr('\\(N[1-3]V?\\)', as.character(r$mercadoApuesta), perl=TRUE))[[1]]
    if (length(niveles) != 1L) stop('Segmento original ausente o ambiguo')
    segmento <- sub('.*(N[1-3]).*','\\1',niveles)
    e <- evidencia_oot[as.character(evidencia_oot$match_id) == as.character(r$match_id) &
          evidencia_oot$mercado == codigo & evidencia_oot$segmento == segmento,,drop=FALSE]
    if (nrow(e) != 1L || anyNA(e)) stop('Evidencia OOT ausente, duplicada o incompleta')
    if (!isTRUE(e$aprobado) || e$tipo_evaluacion != 'OOT' ||
        !is.numeric(e$prob_local) || !is.finite(e$prob_local) || e$prob_local < 0 || e$prob_local > 1 ||
        !is.numeric(e$prob_visita) || !is.finite(e$prob_visita) || e$prob_visita < 0 || e$prob_visita > 1)
      stop('Se requieren aprobacion upstream y probabilidades OOT reales; no se deriva una probabilidad conjunta BTTS')
    # Fechas ISO con zona explicita. No se aceptan timestamps locales ambiguos.
    fecha <- function(x) {
      if (!grepl('^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$', x)) stop('Se requiere timestamp UTC ISO')
      t <- as.POSIXct(x,format='%Y-%m-%dT%H:%M:%SZ',tz='UTC')
      if (is.na(t) || format(t,'%Y-%m-%dT%H:%M:%SZ',tz='UTC') != x) stop('Timestamp invalido')
      t
    }
    t <- lapply(e[c('prediccion_en','entrenamiento_hasta','cuota_en','inicio_partido')], function(x) fecha(as.character(x)))
    if (t$entrenamiento_hasta >= t$prediccion_en || t$prediccion_en >= t$inicio_partido || t$cuota_en >= t$inicio_partido)
      stop('Prediccion/cuota posterior al inicio o entrenamiento no anterior: rechazar fuga temporal')
    cuota <- suppressWarnings(as.numeric(as.character(r$cuotaSimple)))
    if (!is.finite(cuota) || cuota <= 1 || !is.numeric(e$cuota) || !is.finite(e$cuota) || cuota != e$cuota)
      stop('CuotaSimple no coincide con la cuota historica de la seleccion')
    dia <- suppressWarnings(as.numeric(as.character(r$fechaJuego)))
    if (!is.finite(dia) || dia %% 1 != 0) stop('fechaJuego requiere dias Unix validos como en el reporte original')
    fecha_partido <- as.character(as.Date(dia, origin='1970-01-01'))
    if (fecha_partido != as.character(as.Date(t$inicio_partido,tz='UTC'))) stop('Fecha de partido contradictoria')
    salida[[length(salida)+1L]] <- data.frame(match_id=as.character(r$match_id),fecha_partido=fecha_partido,
       liga=as.character(r$liga),temporada=as.character(e$temporada),mercado=codigo,periodo='FT',
       seleccion=seleccion[match(codigo,tipos)],linea=NA_real_,segmento=segmento,cuota=cuota,
       version_politica=as.character(e$version_politica),tipo_evaluacion='OOT',stringsAsFactors=FALSE)
  }
  vacia <- as.data.frame(setNames(replicate(length(campos),character(),simplify=FALSE),campos),stringsAsFactors=FALSE)
  nuevas <- if (length(salida)) do.call(rbind,salida) else vacia
  extender_malla_backtest(vacia,nuevas,politicas_verificadas)
}
