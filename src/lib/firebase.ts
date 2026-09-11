// Firebase has been fully removed from the frontend.
// All auth now uses local JWT via /api/auth/* endpoints.
// This file is kept as a placeholder to prevent import errors if anything still references it.
// Safe to delete once all references are cleaned up.

export const auth = {
  signInWithPopup: () => Promise.reject(new Error('Firebase Auth removed — use local auth')),
};