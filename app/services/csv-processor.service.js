/**
 * CSV Processor Service
 * Handles CSV file parsing and validation for recommendations import
 */

const { parse } = require('csv-parse/sync'); // Using sync version for simplicity

/**
 * Parse CSV file content
 * @param {Buffer|String} csvContent - CSV file content
 * @returns {Array} - Parsed records
 */
function parseCSV(csvContent) {
    try {
        const records = parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            bom: true // Handle BOM (Byte Order Mark) if present
        });
        
        return records;
    } catch (error) {
        throw new Error(`Error parsing CSV: ${error.message}`);
    }
}

/**
 * Validate CSV structure and data
 * @param {Array} records - Parsed CSV records
 * @returns {Object} - Validation result with errors
 */
function validateCSVData(records) {
    const errors = [];
    const validRecords = [];
    
    if (!records || records.length === 0) {
        errors.push({ row: 0, field: 'general', message: 'CSV file is empty' });
        return { valid: false, errors, validRecords };
    }
    
    // Required fields
    const requiredFields = ['equipoLocal', 'equipoVisitante', 'liga'];
    
    records.forEach((record, index) => {
        const rowNumber = index + 2; // +2 because: +1 for header row, +1 for 0-index
        
        const rowErrors = [];
        
        // Check required fields
        for (const field of requiredFields) {
            if (!record[field] || record[field].trim() === '') {
                rowErrors.push({
                    row: rowNumber,
                    field: field,
                    message: `Required field '${field}' is missing or empty`
                });
            }
        }
        
        // Validate numeric fields if present
        if (record.cuotaSimple && isNaN(parseFloat(record.cuotaSimple))) {
            rowErrors.push({
                row: rowNumber,
                field: 'cuotaSimple',
                message: `Invalid numeric value for 'cuotaSimple': ${record.cuotaSimple}`
            });
        }
        
        if (record.cuotaCombinada && isNaN(parseFloat(record.cuotaCombinada))) {
            rowErrors.push({
                row: rowNumber,
                field: 'cuotaCombinada',
                message: `Invalid numeric value for 'cuotaCombinada': ${record.cuotaCombinada}`
            });
        }
        
        // Validate date format if present (YYYY-MM-DD or DD/MM/YYYY)
        if (record.fechaJuego && record.fechaJuego.trim() !== '') {
            const datePattern = /^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})$/;
            if (!datePattern.test(record.fechaJuego.trim())) {
                rowErrors.push({
                    row: rowNumber,
                    field: 'fechaJuego',
                    message: `Invalid date format for 'fechaJuego'. Expected YYYY-MM-DD or DD/MM/YYYY: ${record.fechaJuego}`
                });
            }
        }
        
        if (rowErrors.length === 0) {
            // Transform record to match database schema
            const transformedRecord = {
                id_apuesta_combinada: record.id_apuesta_combinada || record.id_apuesta_combinada || null,
                id_apuesta_simple: record.id_apuesta_simple || null,
                tipoApuesta: record.tipoApuesta || null,
                liga: record.liga.trim(),
                equipoLocal: record.equipoLocal.trim(),
                equipoVisitante: record.equipoVisitante.trim(),
                pais: record.pais || null,
                mercadoApuesta: record.mercadoApuesta || null,
                opcionApuesta: record.opcionApuesta || null,
                valorOpcionApuesta: record.valorOpcionApuesta || null,
                cuotaSimple: record.cuotaSimple ? parseFloat(record.cuotaSimple).toString() : null,
                cuotaCombinada: record.cuotaCombinada ? parseFloat(record.cuotaCombinada).toString() : null,
                fechaRegistro: record.fechaRegistro || new Date().toISOString().split('T')[0],
                fechaJuego: record.fechaJuego || null,
                nombre: record.nombre || null,
                activo: record.activo !== undefined ? record.activo === 'true' || record.activo === true : true
            };
            
            validRecords.push(transformedRecord);
        } else {
            errors.push(...rowErrors);
        }
    });
    
    return {
        valid: errors.length === 0,
        errors: errors,
        validRecords: validRecords
    };
}

/**
 * Get expected CSV columns/headers
 * @returns {Array} - Array of expected column names
 */
function getExpectedColumns() {
    return [
        'id_apuesta_combinada',
        'id_apuesta_simple',
        'tipoApuesta',
        'liga',
        'equipoLocal',
        'equipoVisitante',
        'pais',
        'mercadoApuesta',
        'opcionApuesta',
        'valorOpcionApuesta',
        'cuotaSimple',
        'cuotaCombinada',
        'fechaRegistro',
        'fechaJuego',
        'nombre'
    ];
}

module.exports = {
    parseCSV,
    validateCSVData,
    getExpectedColumns
};

