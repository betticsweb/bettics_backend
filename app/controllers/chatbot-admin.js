const errorMiddleware = require('../middleware/errors');
const { getModel, conectionManager } = require('../config/connection');
const consta = require('../config/constantes');
const csvProcessor = require('../services/csv-processor.service');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
let cacheProvider = require('../shared/cache-provider');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../../uploads/csv');
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'recommendations-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: function (req, file, cb) {
        // Accept only CSV files
        if (file.mimetype === 'text/csv' || 
            file.mimetype === 'application/vnd.ms-excel' ||
            path.extname(file.originalname).toLowerCase() === '.csv') {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'), false);
        }
    }
});

/**
 * Upload and process CSV file
 */
exports.uploadCSV = [
    upload.single('csvFile'),
    async (req, res, next) => {
        const conn = conectionManager(req);
        
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No CSV file uploaded'
                });
            }
            
            // Read and parse CSV file
            const csvContent = fs.readFileSync(req.file.path, 'utf-8');
            const records = csvProcessor.parseCSV(csvContent);
            
            // Validate data
            const validation = csvProcessor.validateCSVData(records);
            
            if (!validation.valid && validation.validRecords.length === 0) {
                // Delete uploaded file
                fs.unlinkSync(req.file.path);
                
                return res.status(400).json({
                    success: false,
                    error: 'CSV validation failed',
                    errors: validation.errors,
                    recordsProcessed: records.length,
                    recordsInserted: 0
                });
            }
            
            // If we have at least some valid records, proceed with import
            if (validation.validRecords.length > 0) {
                const Recomendaciones = getModel(conn, consta.SchemaName.recomendaciones);
                
                // Delete existing recommendations (or update - you may want to change this)
                await Recomendaciones.deleteMany({});
                
                // Insert new recommendations
                const result = await Recomendaciones.insertMany(validation.validRecords);
                
                // Clear cache
                const cacheKey = consta.cacheController.recomendaciones.byGetCriterio;
                cacheProvider.instance().del(cacheKey);
                
                // Delete uploaded file after processing
                fs.unlinkSync(req.file.path);
                
                return res.json({
                    success: true,
                    recordsProcessed: records.length,
                    recordsInserted: result.length,
                    recordsWithErrors: validation.errors.length,
                    errors: validation.errors.length > 0 ? validation.errors : undefined
                });
            } else {
                // Delete uploaded file
                fs.unlinkSync(req.file.path);
                
                return res.status(400).json({
                    success: false,
                    error: 'No valid records found',
                    errors: validation.errors,
                    recordsProcessed: records.length,
                    recordsInserted: 0
                });
            }
            
        } catch (err) {
            // Delete uploaded file on error
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            
            console.error('Error processing CSV upload:', err);
            return errorMiddleware(err, req, res, next);
        } finally {
            if (conn) conn.close();
        }
    }
];

/**
 * Get CSV upload template/expected format
 */
exports.getCSVTemplate = (req, res, next) => {
    try {
        const expectedColumns = csvProcessor.getExpectedColumns();
        
        // Create sample CSV content
        const sampleData = {
            id_apuesta_combinada: 'COMBO001',
            id_apuesta_simple: 'SIMP001',
            tipoApuesta: 'Simple',
            liga: 'Liga 1',
            equipoLocal: 'Alianza Lima',
            equipoVisitante: 'Universitario',
            pais: 'Peru',
            mercadoApuesta: '1X2',
            opcionApuesta: 'Local',
            valorOpcionApuesta: '1',
            cuotaSimple: '2.50',
            cuotaCombinada: '2.50',
            fechaRegistro: '2024-01-10',
            fechaJuego: '2024-01-15',
            nombre: 'Recomendación de prueba'
        };
        
        return res.json({
            success: true,
            expectedColumns: expectedColumns,
            sampleData: sampleData,
            requiredFields: ['equipoLocal', 'equipoVisitante', 'liga']
        });
        
    } catch (err) {
        return errorMiddleware(err, req, res, next);
    }
};

/**
 * Preview CSV before import (without saving)
 */
exports.previewCSV = [
    upload.single('csvFile'),
    async (req, res, next) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No CSV file uploaded'
                });
            }
            
            // Read and parse CSV file
            const csvContent = fs.readFileSync(req.file.path, 'utf-8');
            const records = csvProcessor.parseCSV(csvContent);
            
            // Validate data
            const validation = csvProcessor.validateCSVData(records);
            
            // Delete uploaded file after preview
            fs.unlinkSync(req.file.path);
            
            return res.json({
                success: true,
                recordsProcessed: records.length,
                validRecords: validation.validRecords.length,
                errors: validation.errors,
                preview: validation.validRecords.slice(0, 10) // Show first 10 records
            });
            
        } catch (err) {
            // Delete uploaded file on error
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            
            console.error('Error previewing CSV:', err);
            return errorMiddleware(err, req, res, next);
        }
    }
];

