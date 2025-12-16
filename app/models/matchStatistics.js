const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");

/**
 * Match Statistics Model
 * Stores calculated statistics and probabilities for matches
 * Used by Betina chatbot for generating predictions
 */
const matchStatisticsSchema = new Schema({
    // Match identification
    equipoLocal: {
        type: String,
        required: true,
        index: true
    },
    equipoVisitante: {
        type: String,
        required: true,
        index: true
    },
    liga: {
        type: String,
        required: true,
        index: true
    },
    fechaJuego: {
        type: Date,
        required: true,
        index: true
    },
    idEvent: {
        type: String,
        default: null
    },
    idHomeTeam: {
        type: String,
        default: null
    },
    idAwayTeam: {
        type: String,
        default: null
    },

    // Historical performance (last N matches)
    localStats: {
        // Last 6 matches at home
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        draws: { type: Number, default: 0 },
        goalsScored: { type: Number, default: 0 },
        goalsConceded: { type: Number, default: 0 },
        cornersFor: { type: Number, default: 0 },
        cornersAgainst: { type: Number, default: 0 },
        matchesPlayed: { type: Number, default: 0 }
    },
    visitorStats: {
        // Last 6 matches away
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        draws: { type: Number, default: 0 },
        goalsScored: { type: Number, default: 0 },
        goalsConceded: { type: Number, default: 0 },
        cornersFor: { type: Number, default: 0 },
        cornersAgainst: { type: Number, default: 0 },
        matchesPlayed: { type: Number, default: 0 }
    },

    // Averages
    averages: {
        localGoalsAvg: { type: Number, default: 0 },
        localGoalsConcededAvg: { type: Number, default: 0 },
        localCornersAvg: { type: Number, default: 0 },
        visitorGoalsAvg: { type: Number, default: 0 },
        visitorGoalsConcededAvg: { type: Number, default: 0 },
        visitorCornersAvg: { type: Number, default: 0 },
        totalGoalsAvg: { type: Number, default: 0 },
        totalCornersAvg: { type: Number, default: 0 }
    },

    // Calculated probabilities (0-100)
    probabilities: {
        localWin: { type: Number, default: 0 },
        visitorWin: { type: Number, default: 0 },
        draw: { type: Number, default: 0 },
        btts: { type: Number, default: 0 }, // Both teams to score
        over15Goals: { type: Number, default: 0 },
        over25Goals: { type: Number, default: 0 },
        under25Goals: { type: Number, default: 0 },
        over85Corners: { type: Number, default: 0 },
        over105Corners: { type: Number, default: 0 },
        under85Corners: { type: Number, default: 0 }
    },

    // Recommended odds (from bookmakers or calculated)
    recommendedOdds: {
        localWin: { type: Number, default: null },
        visitorWin: { type: Number, default: null },
        draw: { type: Number, default: null },
        bttsYes: { type: Number, default: null },
        bttsNo: { type: Number, default: null },
        over15Goals: { type: Number, default: null },
        over25Goals: { type: Number, default: null },
        over85Corners: { type: Number, default: null },
        over105Corners: { type: Number, default: null }
    },

    // Analysis summary
    analysis: {
        winnerRecommendation: { type: String, default: null }, // 'local', 'visitor', 'draw'
        valueBet: { type: String, default: null }, // Description of best value bet
        confidence: { type: Number, default: 0 }, // 0-100 confidence level
        summary: { type: String, default: '' } // Text summary
    },

    // Metadata
    lastCalculated: {
        type: Date,
        default: Date.now
    },
    dataSource: {
        type: String,
        enum: ['historical', 'api', 'manual', 'hybrid'],
        default: 'historical'
    },
    activo: {
        type: Boolean,
        default: true
    }
}, {
    versionKey: false,
    timestamps: true
});

// Indexes for efficient queries
matchStatisticsSchema.index({ equipoLocal: 1, equipoVisitante: 1, fechaJuego: 1 });
matchStatisticsSchema.index({ liga: 1, fechaJuego: 1 });
matchStatisticsSchema.index({ fechaJuego: 1, activo: 1 });

matchStatisticsSchema.plugin(aggregatePaginate);
matchStatisticsSchema.plugin(mongoosePaginate);

module.exports = matchStatisticsSchema;

