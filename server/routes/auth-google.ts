import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { prisma } from '../prisma';
import { generateTokens, revokeRefreshToken } from '../local-auth';

const router = Router();

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const FRONTEND_URL = process.env.ALLOWED_ORIGINS || 'http://localhost:5173';
const BACKEND_URL = process.env.API_BASE_URL || 'http://localhost:3001';
// Google redirects to backend, not frontend
// Force the correct redirect URI to match Google Cloud Console
const GOOGLE_REDIRECT_URI = 'https://alm.swarmbuzz.online/api/auth/google/callback';

// Debug logging - LOG ON EVERY REQUEST TO SEE VALUES
console.log('[Google OAuth] Configuration:', {
  GOOGLE_CLIENT_ID: GOOGLE_CLIENT_ID.substring(0, 20) + '...',
  'process.env.API_BASE_URL': process.env.API_BASE_URL,
  'process.env.GOOGLE_CLIENT_ID': process.env.GOOGLE_CLIENT_ID ? 'set' : 'not set',
  BACKEND_URL,
  GOOGLE_REDIRECT_URI,
  FRONTEND_URL,
});

/**
 * GET /api/auth/google
 * Start Google OAuth flow
 * Redirects user to Google's consent page
 */
router.get('/google', (req: Request, res: Response) => {
  console.log('[Google OAuth] /google endpoint called');
  console.log('[Google OAuth] API_BASE_URL:', process.env.API_BASE_URL);
  console.log('[Google OAuth] BACKEND_URL:', BACKEND_URL);
  console.log('[Google OAuth] GOOGLE_REDIRECT_URI:', GOOGLE_REDIRECT_URI);
  
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ message: 'Google OAuth not configured' });
  }

  // Generate state parameter to prevent CSRF attacks
  const state = randomBytes(16).toString('hex');
  
  // Store state in session or cookie (for validation in callback)
  res.cookie('google_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000, // 10 minutes
  });

  // Build Google OAuth URL
  const scope = encodeURIComponent('openid profile email');
  
  // Use the redirect URI that matches what's in Google Cloud Console
  const correctRedirectUri = 'https://alm.swarmbuzz.online/auth/google/callback';
  
  const forcedAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${GOOGLE_CLIENT_ID}` +
    `&redirect_uri=https%3A%2F%2Falm.swarmbuzz.online%2Fauth%2Fgoogle%2Fcallback` +
    `&response_type=code` +
    `&scope=${scope}` +
    `&state=${state}`;

  console.log('[Google OAuth] Using redirect_uri:', correctRedirectUri);
  console.log('[Google OAuth] Full auth URL:', forcedAuthUrl);
  res.redirect(forcedAuthUrl);
});

/**
 * GET /api/auth/google/callback
 * Handle Google OAuth callback
 */
router.get('/google/callback', async (req: Request, res: Response) => {
  console.log('[Google Callback] Callback endpoint called');
  const { code, state } = req.query;
  const savedState = req.cookies.google_oauth_state;
  
  console.log('[Google Callback] Received params:', { code: !!code, state: !!state, savedState: !!savedState });

  // Validate state to prevent CSRF
  if (!state || !savedState || state !== savedState) {
    console.log('[Google Callback] State validation failed:', { received: state, saved, expected: savedState });
    return res.redirect(`${FRONTEND_URL}/auth/google/callback?error=${encodeURIComponent('Invalid OAuth state. Please try signing in again.')}`);
  }

  // Clear state cookie
  res.clearCookie('google_oauth_state');

  if (!code || typeof code !== 'string') {
    console.log('[Google Callback] No code received');
    return res.redirect(`${FRONTEND_URL}/auth/google/callback?error=${encodeURIComponent('Missing authorization code. Please try signing in again.')}`);
  }

  console.log('[Google Callback] Starting token exchange...');

  try {
    // Exchange authorization code for tokens
    const correctRedirectUri = 'https://alm.swarmbuzz.online/auth/google/callback';
    console.log('[Google Callback] Exchanging code with redirect_uri:', correctRedirectUri);
    
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: correctRedirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Google token exchange failed:', errorText);
      throw new Error('Failed to exchange authorization code');
    }

    const tokenData = await tokenResponse.json();

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoResponse.ok) {
      throw new Error('Failed to fetch user info from Google');
    }

    const googleUser = await userInfoResponse.json();
    
    // Find or create user
    let user = await prisma.user.findUnique({
      where: { googleId: googleUser.id },
    });

    if (user) {
      // Existing user with Google account linked
      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastLogin: new Date(),
          ...(googleUser.name ? { firstName: googleUser.name.split(' ')[0] } : {}),
        },
      });
    } else {
      // Check if user exists with same email
      user = await prisma.user.findUnique({
        where: { email: googleUser.email },
      });

      if (user) {
        // Link Google account to existing user
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: googleUser.id,
            authProvider: 'google',
            lastLogin: new Date(),
          },
        });
      } else {
        // Create new user from Google account
        user = await prisma.user.create({
          data: {
            googleId: googleUser.id,
            email: googleUser.email,
            firstName: googleUser.given_name || googleUser.name?.split(' ')[0] || '',
            lastName: googleUser.family_name || googleUser.name?.split(' ').slice(1).join(' ') || '',
            authProvider: 'google',
            role: 'cashier', // Default role
            status: 'active',
            lastLogin: new Date(),
          },
        });
      }
    }

    // Generate JWT tokens
    console.log('[Google Callback] Generating tokens for user ID:', user.id);
    const { accessToken, refreshToken } = generateTokens(user.id);
    console.log('[Google Callback] Tokens generated successfully');

    // Store refresh token in database
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // Redirect to frontend callback page with tokens
    const frontendCallbackUrl = `${FRONTEND_URL}/auth/google/callback?` +
      `access_token=${encodeURIComponent(accessToken)}` +
      `&refresh_token=${encodeURIComponent(refreshToken)}` +
      `&user_id=${encodeURIComponent(user.id)}`;

    console.log('[Google Callback] Redirecting to frontend:', frontendCallbackUrl.substring(0, 100) + '...');
    res.redirect(frontendCallbackUrl);

  } catch (error) {
    console.error('Google OAuth callback error:', error);
    const message = error instanceof Error ? error.message : 'Google authentication failed';
    
    // Redirect to frontend callback with error
    const frontendCallbackUrl = `${FRONTEND_URL}/auth/google/callback?error=${encodeURIComponent(message)}`;
    res.redirect(frontendCallbackUrl);
  }
});

/**
 * POST /api/auth/google/revoke
 * Revoke Google access token
 */
router.post('/google/revoke', async (req: Request, res: Response) => {
  const { googleAccessToken } = req.body;

  if (!googleAccessToken) {
    return res.status(400).json({ message: 'Google access token required' });
  }

  try {
    // Revoke token with Google
    await fetch(`https://oauth2.googleapis.com/revoke?token=${googleAccessToken}`, {
      method: 'POST',
    });

    res.json({ message: 'Google access token revoked' });
  } catch (error) {
    console.error('Failed to revoke Google token:', error);
    res.status(500).json({ message: 'Failed to revoke token' });
  }
});

export default router;