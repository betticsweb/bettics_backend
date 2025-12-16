/**
 * Match Statistics Service
 * Calculates and aggregates match statistics from historical data
 */

const { getModel } = require('../config/connection');
const consta = require('../config/constantes');

/**
 * Get or calculate match statistics for a specific match
 * @param {Object} conn - MongoDB connection
 * @param {string} equipoLocal - Local team name
 * @param {string} equipoVisitante - Visitor team name
 * @param {Date} fechaJuego - Match date
 * @param {string} liga - League name (optional)
 * @returns {Promise<Object>} - Match statistics object
 */
async function getMatchStatistics(conn, equipoLocal, equipoVisitante, fechaJuego, liga = null) {
    try {
        const MatchStatistics = getModel(conn, consta.SchemaName.matchStatistics);
        
        // Try to get existing statistics
        const query = {
            equipoLocal: { $regex: equipoLocal, $options: 'i' },
            equipoVisitante: { $regex: equipoVisitante, $options: 'i' },
            fechaJuego: fechaJuego,
            activo: true
        };
        
        if (liga) {
            query.liga = { $regex: liga, $options: 'i' };
        }
        
        let stats = await MatchStatistics.findOne(query).lean();
        
        // If not found, calculate from historical data
        if (!stats) {
            stats = await calculateMatchStatistics(conn, equipoLocal, equipoVisitante, fechaJuego, liga);
            
            // Save calculated statistics for future use
            if (stats) {
                const statsDoc = new MatchStatistics(stats);
                await statsDoc.save();
            }
        }
        
        return stats;
    } catch (error) {
        console.error('Error getting match statistics:', error);
        return null;
    }
}

/**
 * Calculate match statistics from historical data
 * @param {Object} conn - MongoDB connection
 * @param {string} equipoLocal - Local team name
 * @param {string} equipoVisitante - Visitor team name
 * @param {Date} fechaJuego - Match date
 * @param {string} liga - League name (optional)
 * @returns {Promise<Object>} - Calculated statistics
 */
async function calculateMatchStatistics(conn, equipoLocal, equipoVisitante, fechaJuego, liga = null) {
    try {
        const Resultados = getModel(conn, consta.SchemaName.resultados);
        const EventosLiga = getModel(conn, consta.SchemaName.eventosLiga);
        
        // Get local team's last 6 home matches
        const localHomeMatches = await Resultados.find({
            equipoLocal: { $regex: equipoLocal, $options: 'i' },
            fecha: { $lt: fechaJuego },
            activo: true
        })
        .sort({ fecha: -1 })
        .limit(6)
        .lean();
        
        // Get visitor team's last 6 away matches
        const visitorAwayMatches = await Resultados.find({
            equipoVisitante: { $regex: equipoVisitante, $options: 'i' },
            fecha: { $lt: fechaJuego },
            activo: true
        })
        .sort({ fecha: -1 })
        .limit(6)
        .lean();
        
        // Calculate local team stats
        const localStats = calculateTeamStats(localHomeMatches, 'local');
        
        // Calculate visitor team stats
        const visitorStats = calculateTeamStats(visitorAwayMatches, 'visitor');
        
        // Calculate averages
        const averages = calculateAverages(localStats, visitorStats);
        
        // Calculate probabilities
        const probabilities = calculateProbabilities(localStats, visitorStats, averages);
        
        // Build statistics object
        const statistics = {
            equipoLocal: equipoLocal,
            equipoVisitante: equipoVisitante,
            liga: liga || 'Unknown',
            fechaJuego: fechaJuego,
            localStats: localStats,
            visitorStats: visitorStats,
            averages: averages,
            probabilities: probabilities,
            recommendedOdds: calculateRecommendedOdds(probabilities),
            analysis: generateAnalysis(localStats, visitorStats, probabilities),
            lastCalculated: new Date(),
            dataSource: 'historical',
            activo: true
        };
        
        return statistics;
    } catch (error) {
        console.error('Error calculating match statistics:', error);
        return null;
    }
}

/**
 * Calculate team statistics from match results
 * @param {Array} matches - Array of match documents
 * @param {string} perspective - 'local' or 'visitor'
 * @returns {Object} - Team statistics
 */
function calculateTeamStats(matches, perspective) {
    const stats = {
        wins: 0,
        losses: 0,
        draws: 0,
        goalsScored: 0,
        goalsConceded: 0,
        cornersFor: 0,
        cornersAgainst: 0,
        matchesPlayed: matches.length
    };
    
    matches.forEach(match => {
        const homeScore = match.golestotalesresultado ? 
            (match.golestotalesresultado - (match.golesHechoTotalesLocalVisita || 0)) : 0;
        const awayScore = match.golesHechoTotalesLocalVisita || 0;
        const totalGoals = match.golestotalesresultado || 0;
        const totalCorners = match.cornerstotalesresultado || 0;
        
        if (perspective === 'local') {
            // Local team perspective
            stats.goalsScored += homeScore || 0;
            stats.goalsConceded += awayScore || 0;
            stats.cornersFor += match.cornersLocalProbMas7 || match.cornersLocalProbMas5 || 0;
            stats.cornersAgainst += (totalCorners - (match.cornersLocalProbMas7 || match.cornersLocalProbMas5 || 0));
            
            if (homeScore > awayScore) stats.wins++;
            else if (homeScore < awayScore) stats.losses++;
            else stats.draws++;
        } else {
            // Visitor team perspective
            stats.goalsScored += awayScore || 0;
            stats.goalsConceded += homeScore || 0;
            stats.cornersFor += (totalCorners - (match.cornersLocalProbMas7 || match.cornersLocalProbMas5 || 0));
            stats.cornersAgainst += match.cornersLocalProbMas7 || match.cornersLocalProbMas5 || 0;
            
            if (awayScore > homeScore) stats.wins++;
            else if (awayScore < homeScore) stats.losses++;
            else stats.draws++;
        }
    });
    
    return stats;
}

/**
 * Calculate averages from team statistics
 * @param {Object} localStats - Local team statistics
 * @param {Object} visitorStats - Visitor team statistics
 * @returns {Object} - Averages object
 */
function calculateAverages(localStats, visitorStats) {
    const localMatches = localStats.matchesPlayed || 1;
    const visitorMatches = visitorStats.matchesPlayed || 1;
    
    return {
        localGoalsAvg: localStats.goalsScored / localMatches,
        localGoalsConcededAvg: localStats.goalsConceded / localMatches,
        localCornersAvg: localStats.cornersFor / localMatches,
        visitorGoalsAvg: visitorStats.goalsScored / visitorMatches,
        visitorGoalsConcededAvg: visitorStats.goalsConceded / visitorMatches,
        visitorCornersAvg: visitorStats.cornersFor / visitorMatches,
        totalGoalsAvg: (localStats.goalsScored + visitorStats.goalsScored) / Math.max(localMatches, visitorMatches),
        totalCornersAvg: (localStats.cornersFor + visitorStats.cornersFor) / Math.max(localMatches, visitorMatches)
    };
}

/**
 * Calculate probabilities based on statistics
 * @param {Object} localStats - Local team statistics
 * @param {Object} visitorStats - Visitor team statistics
 * @param {Object} averages - Averages object
 * @returns {Object} - Probabilities object (0-100)
 */
function calculateProbabilities(localStats, visitorStats, averages) {
    const localMatches = localStats.matchesPlayed || 1;
    const visitorMatches = visitorStats.matchesPlayed || 1;
    
    // Win probabilities (based on win rates)
    const localWinRate = (localStats.wins / localMatches) * 100;
    const visitorWinRate = (visitorStats.wins / visitorMatches) * 100;
    const drawRate = 100 - localWinRate - visitorWinRate;
    
    // Normalize to sum to 100
    const total = localWinRate + visitorWinRate + Math.max(0, drawRate);
    const localWin = total > 0 ? (localWinRate / total) * 100 : 33.33;
    const visitorWin = total > 0 ? (visitorWinRate / total) * 100 : 33.33;
    const draw = total > 0 ? (Math.max(0, drawRate) / total) * 100 : 33.34;
    
    // BTTS probability (simplified: based on goals scored/conceded)
    const localScoringRate = averages.localGoalsAvg > 0 ? Math.min(100, (averages.localGoalsAvg / 2) * 50) : 30;
    const visitorScoringRate = averages.visitorGoalsAvg > 0 ? Math.min(100, (averages.visitorGoalsAvg / 2) * 50) : 30;
    const btts = (localScoringRate + visitorScoringRate) / 2;
    
    // Over/Under probabilities (based on average goals)
    const totalGoalsAvg = averages.totalGoalsAvg;
    const over15 = totalGoalsAvg > 1.5 ? Math.min(100, 50 + (totalGoalsAvg - 1.5) * 20) : Math.max(0, 30 + totalGoalsAvg * 15);
    const over25 = totalGoalsAvg > 2.5 ? Math.min(100, 40 + (totalGoalsAvg - 2.5) * 25) : Math.max(0, 20 + totalGoalsAvg * 10);
    const under25 = 100 - over25;
    
    // Corners probabilities
    const totalCornersAvg = averages.totalCornersAvg;
    const over85 = totalCornersAvg > 8.5 ? Math.min(100, 50 + (totalCornersAvg - 8.5) * 10) : Math.max(0, 30 + totalCornersAvg * 3);
    const over105 = totalCornersAvg > 10.5 ? Math.min(100, 40 + (totalCornersAvg - 10.5) * 12) : Math.max(0, 20 + totalCornersAvg * 2);
    const under85 = 100 - over85;
    
    return {
        localWin: Math.round(localWin),
        visitorWin: Math.round(visitorWin),
        draw: Math.round(draw),
        btts: Math.round(btts),
        over15Goals: Math.round(over15),
        over25Goals: Math.round(over25),
        under25Goals: Math.round(under25),
        over85Corners: Math.round(over85),
        over105Corners: Math.round(over105),
        under85Corners: Math.round(under85)
    };
}

/**
 * Calculate recommended odds from probabilities
 * @param {Object} probabilities - Probabilities object
 * @returns {Object} - Recommended odds
 */
function calculateRecommendedOdds(probabilities) {
    // Convert probability to decimal odds: odds = 100 / probability
    // Add margin for bookmaker (5% margin)
    const margin = 1.05;
    
    return {
        localWin: probabilities.localWin > 0 ? (100 / probabilities.localWin) * margin : null,
        visitorWin: probabilities.visitorWin > 0 ? (100 / probabilities.visitorWin) * margin : null,
        draw: probabilities.draw > 0 ? (100 / probabilities.draw) * margin : null,
        bttsYes: probabilities.btts > 0 ? (100 / probabilities.btts) * margin : null,
        bttsNo: probabilities.btts < 100 ? (100 / (100 - probabilities.btts)) * margin : null,
        over15Goals: probabilities.over15Goals > 0 ? (100 / probabilities.over15Goals) * margin : null,
        over25Goals: probabilities.over25Goals > 0 ? (100 / probabilities.over25Goals) * margin : null,
        over85Corners: probabilities.over85Corners > 0 ? (100 / probabilities.over85Corners) * margin : null,
        over105Corners: probabilities.over105Corners > 0 ? (100 / probabilities.over105Corners) * margin : null
    };
}

/**
 * Generate analysis summary
 * @param {Object} localStats - Local team statistics
 * @param {Object} visitorStats - Visitor team statistics
 * @param {Object} probabilities - Probabilities object
 * @returns {Object} - Analysis object
 */
function generateAnalysis(localStats, visitorStats, probabilities) {
    // Determine winner recommendation
    let winnerRecommendation = 'draw';
    if (probabilities.localWin > probabilities.visitorWin && probabilities.localWin > probabilities.draw) {
        winnerRecommendation = 'local';
    } else if (probabilities.visitorWin > probabilities.localWin && probabilities.visitorWin > probabilities.draw) {
        winnerRecommendation = 'visitor';
    }
    
    // Calculate confidence (based on probability difference)
    const maxProb = Math.max(probabilities.localWin, probabilities.visitorWin, probabilities.draw);
    const confidence = Math.min(100, maxProb * 1.2);
    
    // Determine value bet
    let valueBet = null;
    if (probabilities.btts > 75) {
        valueBet = 'BTTS - SÍ (Alta probabilidad)';
    } else if (probabilities.over15Goals > 70) {
        valueBet = 'Over 1.5 goles (Alta probabilidad)';
    } else if (maxProb > 60) {
        valueBet = `Victoria ${winnerRecommendation === 'local' ? 'Local' : winnerRecommendation === 'visitor' ? 'Visitante' : 'Empate'}`;
    }
    
    return {
        winnerRecommendation: winnerRecommendation,
        valueBet: valueBet,
        confidence: Math.round(confidence),
        summary: `Análisis basado en ${localStats.matchesPlayed} partidos locales y ${visitorStats.matchesPlayed} partidos visitantes.`
    };
}

module.exports = {
    getMatchStatistics,
    calculateMatchStatistics,
    calculateTeamStats,
    calculateAverages,
    calculateProbabilities,
    calculateRecommendedOdds,
    generateAnalysis
};

