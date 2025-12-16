const sgMail = require('@sendgrid/mail');
require('dotenv').config()

// Validate and set SendGrid API key (only set if valid format to avoid warnings)
let sendgridConfigured = false;

if (process.env.SENDGRID_API_KEY) {
    const apiKey = process.env.SENDGRID_API_KEY.trim();
    
    // Only set the API key if it's in the correct format (starts with "SG.")
    // This prevents SendGrid from logging the warning
    if (apiKey && apiKey.startsWith('SG.')) {
        sgMail.setApiKey(apiKey);
        sendgridConfigured = true;
        // Silent in production - only log in development
        if (process.env.NODE_ENV !== 'production') {
            console.log('✓ SendGrid API key configured');
        }
    } else if (apiKey) {
        // Key exists but wrong format - only log in development
        if (process.env.NODE_ENV !== 'production') {
            console.warn('⚠️  SendGrid API key format may be incorrect (should start with "SG.")');
        }
        // Don't set it to avoid SendGrid library warnings
        sendgridConfigured = false;
    }
}
// If SENDGRID_API_KEY is not set, sendgridConfigured remains false (silent)

// Export a wrapper that checks configuration before sending
const originalSend = sgMail.send.bind(sgMail);
sgMail.send = async function(...args) {
    if (!sendgridConfigured) {
        const error = new Error('SendGrid is not configured. Set SENDGRID_API_KEY environment variable with a valid key starting with "SG."');
        error.code = 'SENDGRID_NOT_CONFIGURED';
        throw error;
    }
    return originalSend(...args);
};

module.exports = sgMail;