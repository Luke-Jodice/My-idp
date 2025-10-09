# Quick Deploy to Render

## Step-by-Step Instructions

### 1. Prepare Your Repository
```bash
# Make sure all files are committed
git add .
git commit -m "Ready for Render deployment"
git push origin main
```

### 2. Deploy to Render
1. Go to [render.com](https://render.com) and sign up (free, no credit card)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: `saml-idp`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
5. Click "Create Web Service"

### 3. Set Environment Variables
In Render dashboard → Environment tab, add:
- `NODE_ENV`: `production`
- `BASE_URL`: `https://saml-idp.onrender.com` (or your actual URL)
- `QUICKBASE_REALM_URL`: `https://ljodice.quickbase.com`
- `QUICKBASE_ACS_URL`: `https://ljodice.quickbase.com/saml/ssoassert.aspx`

### 4. Update BASE_URL
After deployment, update the `BASE_URL` environment variable with your actual Render URL.

### 5. Test Your Deployment
- Health: `https://your-app.onrender.com/health`
- Metadata: `https://your-app.onrender.com/metadata`
- SSO: `https://your-app.onrender.com/sso`

### 6. Configure Quickbase
Use your Render URL in Quickbase SAML settings:
- Entity ID: `https://your-app.onrender.com/metadata`
- Sign-in URL: `https://your-app.onrender.com/sso`

## That's it! 🎉
Your SAML Identity Provider is now live and ready for Quickbase integration.
