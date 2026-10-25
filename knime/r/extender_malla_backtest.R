# Anexar al mismo objeto malla del R Source existente, antes de su write.csv.
# Entradas ya aprobadas por las reglas originales: no genera aprobaciones nuevas.
extender_malla_backtest <- function(malla_actual, nuevos_aprobados) {
  campos <- c('match_id','fecha_partido','liga','temporada','mercado','periodo',
              'seleccion','linea','segmento','cuota','version_politica','tipo_evaluacion')
  identidad <- c('match_id','mercado','periodo','segmento','version_politica','tipo_evaluacion')
  seleccion <- c(BTTS_YES='YES',FT_HOME_WIN='HOME',FT_AWAY_WIN='AWAY')
  if (!identical(names(malla_actual),campos) || !identical(names(nuevos_aprobados),campos)) stop('Se requieren las mismas 12 columnas')
  if (!nrow(nuevos_aprobados)) return(malla_actual)
  for(i in seq_len(nrow(nuevos_aprobados))) {
    r <- nuevos_aprobados[i,,drop=FALSE]
    if (!r$mercado %in% names(seleccion) || r$periodo != 'FT' ||
        r$seleccion != seleccion[[r$mercado]] || !is.na(r$linea) ||
        !r$segmento %in% c('N1','N2','N3') || !is.finite(r$cuota) || r$cuota<=1 || r$tipo_evaluacion!='OOT')
      stop('Contrato FT incompatible; no se recalculan politicas en este paso')
  }
  total <- rbind(malla_actual,nuevos_aprobados)
  if(anyNA(total[identidad])) stop('Identidad incompleta')
  repetidas <- duplicated(total[identidad])
  for(i in which(repetidas)) {
    mismas <- Reduce(`&`,lapply(identidad,function(k) total[[k]]==total[[k]][i]))
    if(nrow(unique(total[mismas,campos,drop=FALSE]))!=1L) stop('Identidad contradictoria; no sobrescribir historicos')
  }
  total[!repetidas,campos,drop=FALSE]
}
# Inspección del objeto/CSV existente, sin llamadas de red ni escrituras.
resumir_mercados_malla <- function(malla) {
  as.data.frame(table(malla$mercado,malla$segmento), stringsAsFactors=FALSE)
}
