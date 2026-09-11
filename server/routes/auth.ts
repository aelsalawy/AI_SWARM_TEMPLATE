/**
 * Auth routes — Firebase ID token verification + user/company lookup
 *
 * POST /api/auth/login
 *   Accepts: { idToken: string }
 *   Verifies the Firebase ID token, looks up or creates a user profile,
 *   and returns available companies/tenants the user belongs to.
 *
 * GET /api/auth/me
 *   Returns the current user profile (requires valid auth middleware)
 *
 * POST /api/auth/refresh
 *   Returns a fresh Firebase ID token stub — real refresh happens client-side
 *   via Firebase client SDK's onIdTokenChanged.
 */

import { Router, Request, Response } from 'express';
import { db, firebaseReady } from '../firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp } from 'firebase-admin/firestore';

const router = Router();

/**
 * POST /api/auth/login
 * Accept a Firebase ID token, verify it, return user info + companies.
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;

    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ message: 'idToken is required' });
    }

    if (!firebaseReady) {
      // Demo mode — accept any non-empty token as valid
      const demoUser = {
        uid: 'demo-user',
        email: 'demo@swarm.io',
        displayName: 'Demo User',
        role: 'super_admin',
        companies: [
          { id: 'demo-company', name: 'Demo Organization', role: 'super_admin' }
        ]
      };
      return res.json({
        accessToken: idToken,
        refreshToken: idToken,
        user: demoUser,
        companies: demoUser.companies,
        needsCompanySelection: false,
      });
    }

    // Verify the Firebase ID token
    const auth = getAuth();
    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired Firebase ID token' });
    }

    const uid = decoded.uid;
    const email = decoded.email || '';
    const displayName = decoded.name || email?.split('@')[0] || 'User';

    // Look up or create user profile in Firestore
    let userProfile: any = null;
    let companies: Array<{ id: string; name: string; role: string }> = [];

    if (db) {
      // Try to get existing user profile
      const userDoc = await db.collection('users').doc(uid).get();
      
      if (userDoc.exists) {
        userProfile = { id: uid, ...userDoc.data() };

        // Look up companies the user belongs to
        const membershipSnapshot = await db.collection('user_companies')
          .where('userId', '==', uid)
          .get();

        if (!membershipSnapshot.empty) {
          // Fetch company names
          const companyIds = membershipSnapshot.docs.map(doc => doc.data().companyId);
          for (const companyId of companyIds) {
            const companyDoc = await db.collection('companies').doc(companyId).get();
            if (companyDoc.exists) {
              const companyData = companyDoc.data()!;
              const membership = membershipSnapshot.docs.find(
                d => d.data().companyId === companyId
              );
              companies.push({
                id: companyId,
                name: companyData.name || 'Unnamed Organization',
                role: membership?.data().role || 'member',
              });
            }
          }
        }
      } else {
        // Create a new user profile
        const claims = await auth.getUser(uid).then(u => u.customClaims || {});
        const role = claims.role || 'admin';
        const newUser = {
          email,
          displayName,
          role,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };
        await db.collection('users').doc(uid).set(newUser);
        userProfile = { id: uid, ...newUser };
      }
    } else {
      // No Firestore — return basic user info
      userProfile = {
        uid,
        email,
        displayName,
        role: 'admin',
      };

      // Check custom claims for company info
      try {
        const userRecord = await auth.getUser(uid);
        const claims = userRecord.customClaims || {};
        if (claims.companies && Array.isArray(claims.companies)) {
          companies = claims.companies;
        }
      } catch {
        // Can't get custom claims — likely demo mode
      }
    }

    // If user has super_admin role, include a "super admin" company option
    const userRole = userProfile?.role || 'admin';
    if (userRole === 'super_admin' || userRole === 'super-admin') {
      companies = companies.filter(c => c.id !== '_super_admin_');
      companies.unshift({
        id: '_super_admin_',
        name: '🔒 Super Admin (All Tenants)',
        role: 'super_admin',
      });
    }

    // Determine if company selection is needed
    const needsCompanySelection = companies.length > 1;

    return res.json({
      accessToken: idToken,
      refreshToken: idToken,
      user: userProfile,
      companies,
      needsCompanySelection,
    });
  } catch (error: any) {
    console.error('[Auth] Login error:', error);
    return res.status(500).json({ message: error.message || 'Login failed' });
  }
});

/**
 * GET /api/auth/me
 * Return current user profile (requires auth middleware to have verified the token).
 */
router.get('/me', async (req: Request, res: Response) => {
  const uid = (req as any).user?.uid;
  if (!uid) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (!db || !firebaseReady) {
    // Demo mode — return basic profile
    return res.json({
      uid,
      email: (req as any).user?.email || 'demo@swarm.io',
      displayName: 'Demo User',
      role: 'super_admin',
    });
  }

  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({ id: uid, ...userDoc.data() });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to get user' });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh endpoint — real refresh happens client-side via Firebase onIdTokenChanged.
 * This exists for API client compatibility.
 */
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ message: 'refreshToken is required' });
  }

  if (!firebaseReady) {
    // Demo mode — return the same token
    return res.json({
      accessToken: refreshToken,
      refreshToken,
    });
  }

  try {
    // Verify the existing ID token is still valid
    // Real refresh happens client-side via Firebase onIdTokenChanged / getIdToken(true)
    // This endpoint exists for API client compatibility — just validate and return
    const authAdmin = getAuth();
    await authAdmin.verifyIdToken(refreshToken, true); // checkRevoked=true
    // Token is still valid — return it as-is
    return res.json({
      accessToken: refreshToken,
      refreshToken,
    });
  } catch (err: any) {
    // Token expired or revoked — client must re-authenticate via Firebase SDK
    return res.status(401).json({ message: 'Token expired. Please re-authenticate via Firebase SDK.' });
  }
});

/**
 * GET /api/auth/companies
 * Return all companies accessible to the authenticated user.
 */
router.get('/companies', async (req: Request, res: Response) => {
  const uid = (req as any).user?.uid;
  if (!uid) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (!db || !firebaseReady) {
    // Demo mode
    return res.json([
      { id: 'demo-company', name: 'Demo Organization', role: 'super_admin' },
    ]);
  }

  try {
    const membershipSnapshot = await db.collection('user_companies')
      .where('userId', '==', uid)
      .get();

    const companies: Array<{ id: string; name: string; role: string }> = [];

    if (!membershipSnapshot.empty) {
      for (const doc of membershipSnapshot.docs) {
        const data = doc.data();
        const companyDoc = await db.collection('companies').doc(data.companyId).get();
        if (companyDoc.exists) {
          companies.push({
            id: data.companyId,
            name: companyDoc.data()!.name || 'Unnamed',
            role: data.role || 'member',
          });
        }
      }
    }

    // Check if user is super_admin
    const userDoc = await db.collection('users').doc(uid).get();
    const userRole = userDoc.exists ? userDoc.data()?.role : null;
    if (userRole === 'super_admin' || userRole === 'super-admin') {
      companies.unshift({
        id: '_super_admin_',
        name: '🔒 Super Admin (All Tenants)',
        role: 'super_admin',
      });
    }

    return res.json(companies);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to get companies' });
  }
});

export default router;