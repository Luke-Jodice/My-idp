# SAML Identity Provider - Deployment Guide

## Environment Variables

Set these environment variables in your deployment platform:

```bash
# Base URL for your deployed application
# Update this after deployment with your actual Render URL
BASE_URL=https://your-app-name.onrender.com

# Port (Render will set this automatically)
PORT=8080

# Certificate paths (relative to project root)
IDP_PRIVATE_KEY_PATH=./certs/idp-private.pem
IDP_PUBLIC_CERT_PATH=./certs/idp-public.cert

# Quickbase realm configuration
QUICKBASE_REALM_URL=https://ljodice.quickbase.com
QUICKBASE_ACS_URL=https://ljodice.quickbase.com/saml/ssoassert.aspx
```

## Render Deployment

1. **Create Render Account:**
   - Go to [render.com](https://render.com) and sign up for free
   - No credit card required

2. **Connect GitHub Repository:**
   - Push your code to GitHub (if not already done)
   - Connect your GitHub account to Render

3. **Create New Web Service:**
   - Click "New +" → "Web Service"
   - Connect your repository
   - Choose the repository containing this project

4. **Configure Service:**
   - **Name**: `saml-idp` (or your preferred name)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`

5. **Set Environment Variables:**
   - In the Render dashboard, go to Environment tab
   - Add these variables:
     - `NODE_ENV`: `production`
     - `BASE_URL`: `https://your-app-name.onrender.com` (update with actual URL)
     - `QUICKBASE_REALM_URL`: `https://ljodice.quickbase.com`
     - `QUICKBASE_ACS_URL`: `https://ljodice.quickbase.com/saml/ssoassert.aspx`

6. **Deploy:**
   - Click "Create Web Service"
   - Render will automatically build and deploy your app
   - Note your deployment URL (e.g., `https://saml-idp.onrender.com`)

## Quickbase Configuration

After deployment, configure in Quickbase Admin Console:

1. Navigate to **SAML Authentication** settings
2. Enter IdP details:
   - **Entity ID:** `https://your-app-name.onrender.com/metadata`
   - **Sign-in URL:** `https://your-app-name.onrender.com/sso`
   - **Sign-out URL:** `https://your-app-name.onrender.com/slo` (optional)
3. Upload the X.509 certificate from `certs/idp-public.cert`
4. Configure attribute mapping:
   - EmailAddress → Email
   - FirstName → First Name
   - LastName → Last Name
5. Test the SSO flow

## Testing

- **Health Check:** `https://your-app-name.onrender.com/health`
- **Metadata:** `https://your-app-name.onrender.com/metadata`
- **SSO Test:** `https://your-app-name.onrender.com/sso`
- **Login Page:** `https://your-app-name.onrender.com/login`

## Important Notes

- **Free Tier Limitations**: Render's free tier puts apps to sleep after 15 minutes of inactivity, but they wake up quickly when accessed
- **Cold Start**: First request after sleep may take 10-30 seconds to respond
- **SAML Compatibility**: This is fine for SAML SSO as requests are typically quick
- **Custom Domain**: You can add a custom domain in Render dashboard if needed
