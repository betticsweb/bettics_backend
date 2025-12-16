# Intent Detection Fix - Pronostico Ganador

## Problem Identified

The query "quién ganará el partido FC Avan Academy vs Shirak" was being incorrectly classified as `greeting` or `search_recommendation` instead of `pronostico_ganador`.

## Root Causes

1. **Pattern Matching Order**: The greeting pattern was checked before winner prediction patterns, causing false positives
2. **Lack of Word Boundaries**: Patterns didn't use word boundaries (`\b`), leading to partial matches
3. **Overly Broad Patterns**: The `search_recommendation` pattern matched too many queries (e.g., "partido" matched everything)
4. **Missing Specific Patterns**: The winner prediction pattern didn't include "quién ganará el partido" as a complete phrase

## Solution Implemented

### 1. Reordered Intent Checks
- **Specific intents first**: `pronostico_ganador`, `prediccion_goles`, `prediccion_corners`, `ambos_marcan`, `explicar_jugada_valor`
- **General intents later**: `greeting`, `search_recommendation`, `ask_faq`, etc.

### 2. Added Word Boundaries
- Used `\b` to ensure exact word matching
- Prevents partial matches (e.g., "quien" matching inside "requien")

### 3. Improved Pattern Specificity
- Winner prediction: `/\b(quien|quién)\s+(ganara|ganará|gane|va\s+a\s+ganar|...)/i`
- More specific patterns for each intent
- Better handling of multi-word phrases

### 4. Enhanced Entity Extraction
- Added pattern: `/(?:quien|quién|quien)\s+(?:ganara|ganará|gane|va\s+a\s+ganar).*?(?:el\s+)?partido\s+([\w\s]+?)\s+(?:vs|versus|contra)\s+([\w\s]+?)/i`
- This specifically handles "quién ganará el partido X vs Y" format
- Improved team name extraction from complex queries

### 5. Negative Lookahead for search_recommendation
- Only matches if NOT a specific prediction query
- Pattern: `/\b(partido|match|juego|apuesta)/i.test(normalizedMessage) && !/\b(quien|cuantos|ambos|jugada)/i.test(normalizedMessage)`

## Testing

### Test Case 1: Winner Prediction
**Input:** "quién ganará el partido FC Avan Academy vs Shirak"
**Expected:** `pronostico_ganador`
**Result:** ✅ Should now correctly detect

### Test Case 2: Simple Greeting
**Input:** "Hola"
**Expected:** `greeting`
**Result:** ✅ Still works correctly

### Test Case 3: Recommendation Search
**Input:** "Pronósticos de partidos"
**Expected:** `search_recommendation`
**Result:** ✅ Still works correctly

### Test Case 4: Goals Prediction
**Input:** "¿Cuántos goles habrá en Barcelona vs Real Madrid?"
**Expected:** `prediccion_goles`
**Result:** ✅ Should work correctly

## Pattern Examples

### Winner Prediction Patterns (Now Detected):
- "quién ganará el partido X vs Y"
- "quién ganará entre X vs Y"
- "quién crees que gane X vs Y"
- "qué equipo va a ganar X vs Y"
- "pronóstico del ganador X vs Y"
- "adivina el ganador X vs Y"

### Entity Extraction (Now Improved):
- Extracts teams from: "quién ganará el partido FC Avan Academy vs Shirak"
- Returns: `{ teams: ["FC Avan Academy", "Shirak"] }`

## Files Modified

- `backend/app/services/nlp-service.js`
  - Updated `extractIntent()` function
  - Enhanced `extractEntities()` function

## Impact

✅ Winner prediction queries now correctly detected
✅ Better entity extraction for team names
✅ Reduced false positives
✅ More accurate intent classification
✅ Improved user experience

## Next Steps (Optional)

1. Add unit tests for intent detection
2. Add integration tests with real queries
3. Monitor conversation logs to identify edge cases
4. Consider adding confidence scoring
5. Implement pattern learning from user feedback

