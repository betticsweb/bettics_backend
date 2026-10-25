source('knime/r/extender_malla_backtest.R')
source('knime/r/preparar_malla_ft.R')
r <- data.frame(match_id='123',liga='Germany Bundesliga',mercadoApuesta='Ambos equipos marcan (N1)',valorOpcionApuesta=0.5,cuotaSimple=1.8,fechaJuego=as.numeric(as.Date('2026-01-01')),stringsAsFactors=FALSE)
e <- data.frame(match_id='123',mercado='AMBOS_MARCAN_SI',segmento='N1',temporada='2025/2026',version_politica='TEST',tipo_evaluacion='OOT',aprobado=TRUE,prob_local=0.7,prob_visita=0.6,cuota=1.8,prediccion_en='2026-01-01T10:00:00Z',entrenamiento_hasta='2025-12-01T00:00:00Z',cuota_en='2026-01-01T10:00:00Z',inicio_partido='2026-01-01T12:00:00Z',stringsAsFactors=FALSE)
p <- list(mercado='AMBOS_MARCAN_SI',version_politica='TEST',family='BTTS',seleccion='YES',linea=NULL,segmentos='N1',verified=TRUE,evidence='TEST FIXTURE ONLY')
fails <- function(expr) stopifnot(inherits(tryCatch({force(expr); NULL},error=function(e)e),'error'))
s <- preparar_malla_ft(r,e,list(p)); stopifnot(nrow(s)==1, s$cuota==1.8, is.na(s$linea),s$seleccion=='YES')
bad<-e; bad$prediccion_en<-bad$inicio_partido; fails(preparar_malla_ft(r,bad,list(p)))
bad<-e; bad$cuota_en<-'2026-01-02T10:00:00Z'; fails(preparar_malla_ft(r,bad,list(p)))
bad<-e; bad$entrenamiento_hasta<-bad$prediccion_en; fails(preparar_malla_ft(r,bad,list(p)))
bad<-e; bad$prob_local<-NA; fails(preparar_malla_ft(r,bad,list(p)))
bad<-e; bad$aprobado<-FALSE; fails(preparar_malla_ft(r,bad,list(p)))
bad<-e; bad$cuota<-2; fails(preparar_malla_ft(r,bad,list(p)))
fails(preparar_malla_ft(r,rbind(e,e),list(p)))
bad<-r; bad$mercadoApuesta<-'Ganador del primer tiempo (N1)';stopifnot(nrow(preparar_malla_ft(bad,e,list(p)))==0)
for (i in 1:2) {
 rr<-r;rr$mercadoApuesta<-'Ganador del partido (N1)';rr$valorOpcionApuesta<-i
 ee<-e;ee$mercado<-c('GANADOR_FT_LOCAL','GANADOR_FT_VISITANTE')[i]
 pp<-p;pp$mercado<-ee$mercado;pp$family<-'FT_WINNER';pp$seleccion<-c('HOME','AWAY')[i];pp$drawRule<-'loss'
 stopifnot(preparar_malla_ft(rr,ee,list(pp))$seleccion==pp$seleccion)
}
cat('11 FT scenarios passed; fixtures only, no CSV or MongoDB writes\n')
