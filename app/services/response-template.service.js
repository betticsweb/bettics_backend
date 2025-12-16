/**
 * Response Template Engine Service
 * Handles dynamic response generation with variable substitution
 */

/**
 * Replace template variables with actual data
 * @param {string} template - Template string with $variables
 * @param {Object} data - Data object with values to substitute
 * @returns {string} - Formatted response
 */
function formatTemplate(template, data = {}) {
    if (!template || typeof template !== 'string') {
        return '';
    }

    let formatted = template;

    // Replace $variable with data.variable
    // Supports: $equipo_local, $equipo_visitante, $probabilidad, etc.
    formatted = formatted.replace(/\$(\w+)/g, (match, key) => {
        const value = getNestedValue(data, key);
        return value !== undefined && value !== null ? String(value) : match;
    });

    // Replace ${variable} syntax (alternative format)
    formatted = formatted.replace(/\$\{(\w+)\}/g, (match, key) => {
        const value = getNestedValue(data, key);
        return value !== undefined && value !== null ? String(value) : match;
    });

    return formatted;
}

/**
 * Get nested value from object using dot notation or direct key
 * @param {Object} obj - Data object
 * @param {string} path - Key path (e.g., 'equipo_local' or 'stats.wins')
 * @returns {*} - Value or undefined
 */
function getNestedValue(obj, path) {
    if (!obj || !path) return undefined;

    // Try direct key first
    if (obj[path] !== undefined) {
        return obj[path];
    }

    // Try with underscore to camelCase conversion
    const camelKey = underscoreToCamelCase(path);
    if (obj[camelKey] !== undefined) {
        return obj[camelKey];
    }

    // Try nested path
    const keys = path.split('.');
    let value = obj;
    for (const key of keys) {
        if (value && typeof value === 'object') {
            value = value[key] || value[underscoreToCamelCase(key)];
        } else {
            return undefined;
        }
    }
    return value;
}

/**
 * Convert underscore_case to camelCase
 * @param {string} str - String in underscore_case
 * @returns {string} - String in camelCase
 */
function underscoreToCamelCase(str) {
    return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

/**
 * Format number with specified decimal places
 * @param {number} num - Number to format
 * @param {number} decimals - Decimal places (default: 2)
 * @returns {string} - Formatted number
 */
function formatNumber(num, decimals = 2) {
    if (num === null || num === undefined || isNaN(num)) {
        return 'N/A';
    }
    return parseFloat(num).toFixed(decimals);
}

/**
 * Format percentage
 * @param {number} num - Number (0-100 or 0-1)
 * @param {boolean} isDecimal - If true, treats num as 0-1, else 0-100
 * @returns {string} - Formatted percentage
 */
function formatPercentage(num, isDecimal = false) {
    if (num === null || num === undefined || isNaN(num)) {
        return 'N/A';
    }
    const percentage = isDecimal ? num * 100 : num;
    return `${formatNumber(percentage, 0)}%`;
}

/**
 * Format match statistics for winner prediction response
 * @param {Object} stats - Match statistics object
 * @param {string} template - Template string
 * @returns {string} - Formatted response
 */
function formatWinnerPrediction(stats, template) {
    const data = {
        equipo_local: stats.equipoLocal || 'Equipo Local',
        equipo_visitante: stats.equipoVisitante || 'Equipo Visitante',
        local_wins: stats.localStats?.wins || 0,
        local_losses: stats.localStats?.losses || 0,
        local_draws: stats.localStats?.draws || 0,
        visitor_wins: stats.visitorStats?.wins || 0,
        visitor_losses: stats.visitorStats?.losses || 0,
        visitor_draws: stats.visitorStats?.draws || 0,
        local_probability: formatPercentage(stats.probabilities?.localWin || 0),
        visitor_probability: formatPercentage(stats.probabilities?.visitorWin || 0),
        draw_probability: formatPercentage(stats.probabilities?.draw || 0),
        recommended_team: stats.analysis?.winnerRecommendation === 'local' 
            ? stats.equipoLocal 
            : stats.analysis?.winnerRecommendation === 'visitor' 
                ? stats.equipoVisitante 
                : 'Empate',
        recommended_odds: formatNumber(stats.recommendedOdds?.localWin || stats.recommendedOdds?.visitorWin || 0)
    };

    return formatTemplate(template, data);
}

/**
 * Format goals prediction response
 * @param {Object} stats - Match statistics object
 * @param {string} template - Template string
 * @returns {string} - Formatted response
 */
function formatGoalsPrediction(stats, template) {
    const data = {
        equipo_local: stats.equipoLocal || 'Equipo Local',
        equipo_visitante: stats.equipoVisitante || 'Equipo Visitante',
        local_goals_avg: formatNumber(stats.averages?.localGoalsAvg || 0, 1),
        visitor_goals_avg: formatNumber(stats.averages?.visitorGoalsAvg || 0, 1),
        total_goals_avg: formatNumber(stats.averages?.totalGoalsAvg || 0, 1),
        over15_probability: formatPercentage(stats.probabilities?.over15Goals || 0),
        over25_probability: formatPercentage(stats.probabilities?.over25Goals || 0),
        over15_odds: formatNumber(stats.recommendedOdds?.over15Goals || 0),
        over25_odds: formatNumber(stats.recommendedOdds?.over25Goals || 0)
    };

    return formatTemplate(template, data);
}

/**
 * Format corners prediction response
 * @param {Object} stats - Match statistics object
 * @param {string} template - Template string
 * @returns {string} - Formatted response
 */
function formatCornersPrediction(stats, template) {
    const data = {
        equipo_local: stats.equipoLocal || 'Equipo Local',
        equipo_visitante: stats.equipoVisitante || 'Equipo Visitante',
        local_corners_avg: formatNumber(stats.averages?.localCornersAvg || 0, 1),
        visitor_corners_avg: formatNumber(stats.averages?.visitorCornersAvg || 0, 1),
        total_corners_avg: formatNumber(stats.averages?.totalCornersAvg || 0, 1),
        over85_probability: formatPercentage(stats.probabilities?.over85Corners || 0),
        over105_probability: formatPercentage(stats.probabilities?.over105Corners || 0),
        over85_odds: formatNumber(stats.recommendedOdds?.over85Corners || 0),
        over105_odds: formatNumber(stats.recommendedOdds?.over105Corners || 0)
    };

    return formatTemplate(template, data);
}

/**
 * Format BTTS (Both Teams To Score) response
 * @param {Object} stats - Match statistics object
 * @param {string} template - Template string
 * @returns {string} - Formatted response
 */
function formatBTTSPrediction(stats, template) {
    const data = {
        equipo_local: stats.equipoLocal || 'Equipo Local',
        equipo_visitante: stats.equipoVisitante || 'Equipo Visitante',
        btts_probability: formatPercentage(stats.probabilities?.btts || 0),
        btts_odds: formatNumber(stats.recommendedOdds?.bttsYes || 0),
        local_goals_avg: formatNumber(stats.averages?.localGoalsAvg || 0, 1),
        visitor_goals_avg: formatNumber(stats.averages?.visitorGoalsAvg || 0, 1)
    };

    return formatTemplate(template, data);
}

module.exports = {
    formatTemplate,
    formatNumber,
    formatPercentage,
    formatWinnerPrediction,
    formatGoalsPrediction,
    formatCornersPrediction,
    formatBTTSPrediction,
    getNestedValue
};

