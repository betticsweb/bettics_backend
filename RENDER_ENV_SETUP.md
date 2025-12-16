# Render Environment Variables Setup Guide

## Required Environment Variables

The following environment variables **MUST** be set in your Render dashboard for the backend to work correctly:

### Database Configuration

1. **USR_NAME**
   - Description: MongoDB Atlas username
   - Example: `dbAdmin` or `adminmongo`
   - **Required**: Yes

2. **PSS_WORD**
   - Description: MongoDB Atlas password
   - Example: `your_password_here`
   - **Required**: Yes
   - **Security**: Never commit this to git

3. **CLU**
   - Description: MongoDB Atlas cluster name (without .mongodb.net)
   - Example: `serverfe-prod.4dt1r` or `serverfe.qz1jw`
   - **Required**: Yes
   - **Important**: Do NOT include `.mongodb.net` in the value

### Authentication

4. **KEY_JWT**
   - Description: Secret key for JWT token signing
   - Example: `your_jwt_secret_key_here`
   - **Required**: Yes (for authentication endpoints)
   - **Security**: Use a strong, random string

### SendGrid Email (Optional but Recommended)

5. **SENDGRID_API_KEY**
   - Description: SendGrid API key for sending emails
   - Format: Must start with `SG.`
   - Example: `SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - **Required**: No (but needed for email functionality)
   - **Note**: If not set, email features will not work but the server will still start

### PayPal Configuration (If using PayPal subscriptions)

6. **PAYPAL_CLIENT_ID**
   - Description: PayPal API client ID
   - **Required**: No (only if using PayPal)

7. **PAYPAL_CLIENT_SECRET**
   - Description: PayPal API client secret
   - **Required**: No (only if using PayPal)

8. **PAYPAL_URL**
   - Description: PayPal API URL
   - Example: `https://api-m.sandbox.paypal.com` (sandbox) or `https://api-m.paypal.com` (production)
   - **Required**: No (only if using PayPal)

9. **PAYPAL_SUCESSS_URL**
   - Description: URL to redirect after successful PayPal payment
   - Example: `https://bettics-frontend.vercel.app/cuenta/suscripcion/exitoso`
   - **Required**: No (only if using PayPal)

10. **PAYPAL_ERROR_URL**
    - Description: URL to redirect after failed/cancelled PayPal payment
    - Example: `https://bettics-frontend.vercel.app/cuenta/suscripcion/fallido`
    - **Required**: No (only if using PayPal)

## How to Set Environment Variables in Render

1. Go to your Render dashboard
2. Navigate to your service (backend)
3. Click on "Environment" in the left sidebar
4. Click "Add Environment Variable"
5. Add each variable with its name and value
6. Click "Save Changes"
7. Render will automatically redeploy your service

## Verification

After setting the environment variables, check the logs during deployment. You should see:

```
✓ Required environment variables validated
```

If you see error messages about missing variables, check your Render environment configuration.

## Troubleshooting

### Error: `querySrv ENOTFOUND _mongodb._tcp.undefined.mongodb.net`

**Cause**: The `CLU` environment variable is not set or is empty.

**Solution**: 
1. Check Render dashboard → Environment variables
2. Verify `CLU` is set (without `.mongodb.net`)
3. Example: If your cluster is `serverfe-prod.4dt1r.mongodb.net`, set `CLU=serverfe-prod.4dt1r`

### Warning: `API key does not start with "SG."`

**Cause**: The SendGrid API key is either missing or has incorrect format.

**Solution**:
1. Get your SendGrid API key from SendGrid dashboard
2. Ensure it starts with `SG.`
3. Set it in Render as `SENDGRID_API_KEY`

### Error: Missing required environment variables

**Cause**: One or more required variables are not set.

**Solution**: Check the startup logs to see which variables are missing and add them in Render.

---

**Last Updated**: 2025-12-11

