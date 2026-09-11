# Google Sign-In Setup Guide

## Overview
This document explains how to set up Google OAuth for Sign-In in the ALM system.

## Architecture
- **Backend**: Express.js routes (`/api/auth/google`, `/api/auth/google/callback`)
- **Frontend**: React component with OAuth callback handling
- **Auth Method**: JWT tokens generated after Google OAuth success
- **Account Linking**: Auto-links existing users by email

## Prerequisites

1. Google Cloud Console account
2. Domain name (e.g., `alm.swarmbuzz.online`)

## Step 1: Create Google OAuth App

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Navigate to: **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure OAuth consent screen (if prompted)
6. Application type: **Web application**
7. Name: `ALM - Swarm Orchestrator`

### Authorized Redirect URIs
Add the following redirect URI:
```
https://alm.swarmbuzz.online/auth/google/callback
```

For local development (if needed):
```
http://localhost:5173/auth/google/callback
```

8. Click **Create**
9. Copy your **Client ID** and **Client Secret**

## Step 2: Configure Environment Variables

Edit `server/.env`:

```bash
# === GOOGLE OAUTH CONFIGURATION ===
GOOGLE_CLIENT_ID=your-google-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret-here
```

**⚠️ SECURITY NOTE:** Never commit `.env` files with real credentials!

## Step 3: Database Schema

The User model has been updated to support Google auth:

```prisma
model User {
  googleId     String?  @unique  // Google user ID
  authProvider String?           // "local" | "google"
  passwordHash String?           // Optional (null for Google-only users)
  // ... other fields
}
```

Run database migration (already done):
```bash
npx prisma db push --accept-data-loss
```

## Step 4: Restart Server

```bash
cd /home/node/.openclaw/workspace-cto
./start-alm.sh
```

## How It Works

### Flow Diagram
```
User clicks "Sign in with Google"
         ↓
Frontend redirects to /api/auth/google
         ↓
Server redirects to Google OAuth page
         ↓
User signs in with Google
         ↓
Google redirects to /api/auth/google/callback?code=...
         ↓
Server exchanges code for access token
         ↓
Server fetches user info from Google
         ↓
Server creates/links user account
         ↓
Server generates JWT tokens
         ↓
Server redirects to frontend with tokens
         ↓
Frontend stores tokens and logs user in
```

### Security Features

1. **CSRF Protection**: State parameter prevents CSRF attacks
2. **PKCE-Ready**: OAuth 2.0 with authorization code flow
3. **Token Storage**: Secure httpOnly cookies for state, localStorage for JWT
4. **Account Linking**: Google users with existing email are auto-linked
5. **Role Management**: New Google users get default `cashier` role

## Testing

### 1. Test Google OAuth Flow
```bash
# Visit login page
https://alm.swarmbuzz.online

# Click "Sign in with Google"
# Sign in with your Google account
# Verify you're logged in
```

### 2. Test Account Linking
```bash
# Create local user: test@example.com / Test123456

# Sign in with Google using test@example.com
# Verify account is linked (check database)
```

### 3. Verify Database
```bash
# Connect to database
psql -h 76.13.151.30 -U postgres -d alm_auth_db

# Check user
SELECT id, email, googleId, authProvider FROM users WHERE email = 'your@gmail.com';
```

## Frontend Components

### GoogleSignInButton Component
- Location: `/src/components/GoogleSignInButton.tsx`
- Renders Google-branded sign-in button
- Handles loading state during OAuth flow

### LoginPage Updates
- OAuth callback URL handling in `useEffect`
- Token storage in localStorage
- URL cleanup after callback

## Backend Endpoints

### GET /api/auth/google
Starts OAuth flow by redirecting to Google

### GET /api/auth/google/callback
Handles Google's OAuth callback
- Validates state parameter
- Exchanges code for tokens
- Fetches user info
- Creates/links user account
- Generates JWT tokens
- Redirects to frontend

### POST /api/auth/google/revoke
Revoke Google access token (optional feature)

## Troubleshooting

### Error: "Google OAuth not configured"
**Cause**: Missing `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` in `.env`

**Fix**: Add credentials to `server/.env`

### Error: "Invalid redirect URI"
**Cause**: Redirect URI not configured in Google Cloud Console

**Fix**: Add `https://alm.swarmbuzz.online/auth/google/callback` to authorized redirect URIs

### Error: "Error 400: redirect_uri_mismatch"
**Cause**: Redirect URI in Google console doesn't match

**Fix**: Check exact URL matches in Google Console (no trailing slash)

### Error: "Invalid state parameter"
**Cause**: CSRF state mismatch or cookie issues

**Fix**: Check browser cookies, clear cache, retry

### Callback hangs / doesn't redirect
**Cause**: Backend not running or redirect blocked

**Fix**: 
1. Verify server is running: `curl http://127.0.0.1:3001/api/health`
2. Check browser console for errors
3. Check backend logs: `tail -f /tmp/alm-server.log`

## Production Deployment

### Required Environment Variables
```bash
GOOGLE_CLIENT_ID=<from-google-cloud-console>
GOOGLE_CLIENT_SECRET=<from-google-cloud-console>
ALLOWED_ORIGINS=https://alm.swarmbuzz.online
```

### Caddy Configuration
The backend handles OAuth redirects, no Caddy changes needed.

### HTTPS Requirement
Google OAuth requires HTTPS in production. Your domain must have:
- Valid SSL certificate (Caddy handles this)
- Proper DNS configuration

## User Management

Admin can see Google-authenticated users in Admin Panel:
- `authProvider` field shows "google"
- `googleId` field populated
- `passwordHash` is null

### Upgrading Google User to Local Password
Users with Google auth can later add a local password:
1. Add "Set Password" functionality (not yet implemented)
2. Update `authProvider` to "hybrid" (optional enhancement)

## Future Enhancements

- [ ] "Set Password" for Google users
- [ ] Unlink Google account option
- [ ] Multiple auth providers per user
- [ ] Google Groups/Workspace integration
- [ ] Admin consent screen branding
- [ ] Custom OAuth scopes (e.g., Google Drive)

## References

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Sign-In Best Practices](https://developers.google.com/identity/gsi/web/guides/overview)
- [RFC 6749: OAuth 2.0](https://tools.ietf.org/html/rfc6749)