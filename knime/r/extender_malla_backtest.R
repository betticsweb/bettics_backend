# Adaptador aditivo. Requiere las salidas aprobadas reales, nunca recalcula N1-N4.
# Integrar en el generador original ANTES de su write.csv existente.
extender_malla_backtest <- function(malla_actual, nuevos_aprobados, politicas_verificadas) {
  campos <- c('match_id','fecha_partido','liga','temporada','mercado','periodo',
              'seleccion','linea','segmento','cuota','version_politica','tipo_evaluacion')
  identidad <- c('match_id','mercado','periodo','segmento','version_politica','tipo_evaluacion')
  if (!identical(names(malla_actual), campos) || !identical(names(nuevos_aprobados), campos))
    stop('Se requieren exactamente las 12 columnas del CSV consolidado')
  if (!nrow(nuevos_aprobados)) return(malla_actual)
  if (!length(politicas_verificadas)) stop('Faltan politicas originales verificadas')
  for (i in seq_len(nrow(nuevos_aprobados))) {
    fila <- nuevos_aprobados[i, , drop=FALSE]
    reglas <- Filter(function(p) identical(p$mercado, as.character(fila$mercado)) &&
      identical(p$version_politica, as.character(fila$version_politica)), politicas_verificadas)
    if (length(reglas) != 1L) stop('Politica ausente o ambigua')
    p <- reglas[[1]]
    if (!isTRUE(p$verified) || is.null(p$evidence) || !nzchar(p$evidence) ||
        !as.character(fila$segmento) %in% p$segmentos ||
        !identical(as.character(fila$seleccion), p$seleccion) ||
        !identical(as.character(fila$periodo), if (startsWith(p$family,'HT_')) 'HT' else 'FT') ||
        (is.null(p$linea) && !is.na(fila$linea)) ||
        (!is.null(p$linea) && (is.na(fila$linea) || fila$linea != p$linea)) ||
        !is.finite(fila$cuota) || fila$cuota <= 1 || fila$tipo_evaluacion != 'OOT')
      stop('Fila incompatible con la politica aprobada')
  }
  total <- rbind(malla_actual, nuevos_aprobados)
  if (anyNA(total[identidad])) stop('Identidad incompleta')
  # Comparar columnas sin concatenar identificadores (evita colisiones de separadores).
  repetidas <- duplicated(total[identidad])
  for (i in which(repetidas)) {
    mismas <- Reduce(`&`, lapply(identidad, function(k) total[[k]] == total[[k]][i]))
    if (nrow(unique(total[mismas, campos, drop=FALSE])) != 1L)
      stop('Identidad repetida con valores diferentes: no sobrescribir historicos')
  }
  total[!repetidas, campos, drop=FALSE]
}
