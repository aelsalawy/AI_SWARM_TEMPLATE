/**
 * AuthContext — JWT-based authentication context
 * Replaces Firebase Auth with JWT token management
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiClient } from '../lib/api-client';
import type { User } from '../lib/types';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check for existing tokens on app load
  useEffect(() => {
    const checkAuth = async () => {
      const accessToken = localStorage.getItem('accessToken');
      const refreshToken = localStorage.getItem('refreshToken');

      if (accessToken && refreshToken) {
        try {
          // Try to get current user
          const currentUser = await apiClient.auth.getCurrentUser();
          setUser(currentUser);
        } catch (err) {
          // Tokens might be expired, silently continue
          // User will be redirected to login on first protected route
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const { user: userData } = await apiClient.auth.login(email, password);
      setUser(userData);
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.auth.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      // Always clear local state — user must be logged out regardless of server response
      setUser(null);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
  }, []);

  const refreshAccessToken = useCallback(async () => {
    try {
      await apiClient.auth.refreshToken();
      // Refresh current user data
      const currentUser = await apiClient.auth.getCurrentUser();
      setUser(currentUser);
    } catch (err) {
      console.error('Token refresh failed:', err);
      // Clear tokens and sign out
      await logout();
    }
  }, [logout]);



  return (
    <AuthContext.Provider
      value={{ 
        user, 
        login, 
        logout, 
        refreshAccessToken, 
        isAuthenticated: !!user, 
        isLoading: loading 
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
