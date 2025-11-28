import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authAPI } from '../services/api';

interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  monthly_budget?: number;
  language_preference?: string;
  notification_preferences?: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  subscription_status?: string;
  call_limit?: number;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  logout: () => void;
  resetPassword: (email: string) => Promise<void>;
  isAdmin: () => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // Try to load user from cache first (for offline/network error scenarios)
  const getCachedUser = (): User | null => {
    try {
      const cached = localStorage.getItem('user_cache');
      if (cached) {
        const userData = JSON.parse(cached);
        // Check if cache is not too old (24 hours)
        const cacheTime = localStorage.getItem('user_cache_time');
        if (cacheTime) {
          const age = Date.now() - parseInt(cacheTime);
          if (age < 24 * 60 * 60 * 1000) { // 24 hours
            return userData;
          }
        }
      }
    } catch (e) {
      // Ignore cache errors
    }
    return null;
  };

  const [user, setUser] = useState<User | null>(getCachedUser());
  const [loading, setLoading] = useState(true);

  // Save user to cache whenever it changes
  useEffect(() => {
    if (user) {
      try {
        localStorage.setItem('user_cache', JSON.stringify(user));
        localStorage.setItem('user_cache_time', Date.now().toString());
      } catch (e) {
        // Ignore storage errors
      }
    }
  }, [user]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // Retry logic for network errors
      const loadUser = async (retryCount = 0) => {
        try {
          const userData = await authAPI.getCurrentUser();
          setUser(userData);
          setLoading(false);
        } catch (error: any) {
          // Only remove token on authentication errors (401/403), not on network errors
          if (error.response?.status === 401 || error.response?.status === 403) {
            console.error('Authentication failed:', error);
            localStorage.removeItem('token');
            localStorage.removeItem('user_cache');
            localStorage.removeItem('user_cache_time');
            // Clear playground chat history on auth failure
            localStorage.removeItem('agent_playground_state');
            setUser(null);
            setLoading(false);
          } else {
            // Network error or timeout - retry up to 2 times before giving up
            if (retryCount < 2) {
              console.warn(`Error loading user data (attempt ${retryCount + 1}/3), retrying...`, error);
              setTimeout(() => {
                loadUser(retryCount + 1);
              }, 1000 * (retryCount + 1)); // Exponential backoff: 1s, 2s
            } else {
              // After retries, if still failing but token exists, use cached user
              console.warn('Failed to load user data after retries. Using cached user if available...', error);
              
              // Check for cached user immediately
              const cachedUser = getCachedUser();
              if (cachedUser) {
                console.warn('Using cached user data due to network issues.');
                setUser(cachedUser);
                setLoading(false);
              } else {
                // No cached user - try one more time with a longer delay
                setTimeout(async () => {
                  try {
                    const userData = await authAPI.getCurrentUser();
                    setUser(userData);
                  } catch (finalError: any) {
                    // If still failing, check if we have token
                    const stillHasToken = localStorage.getItem('token');
                    if (stillHasToken && finalError.response?.status !== 401 && finalError.response?.status !== 403) {
                      // Token exists and it's not an auth error - keep current user state (might be null)
                      // ProtectedRoute will allow access based on token
                      console.warn('Backend unavailable but token exists. Keeping session active.');
                      // Don't change user state - keep whatever we have (might be cached from initial load)
                    } else {
                      setUser(null);
                    }
                  }
                }, 2000);
                
                setLoading(false);
              }
            }
          }
        }
      };
      
      loadUser();
    } else {
      // No token - clear cache
      localStorage.removeItem('user_cache');
      localStorage.removeItem('user_cache_time');
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await authAPI.login({ email, password });
      localStorage.setItem('token', response.access_token);
      
      // Dispatch custom event to trigger immediate data loading
      window.dispatchEvent(new Event('tokenChanged'));
      
      // Wait for user data to load before completing login
      // This ensures ProtectedRoute has the user state when navigation happens
      try {
        const userData = await authAPI.getCurrentUser();
        setUser(userData);
      } catch (error) {
        console.error('Error loading user data:', error);
        // If getCurrentUser fails, still allow login but user will be null
        // The token is valid, so user can retry or refresh
        throw new Error('Failed to load user data. Please try again.');
      }
    } catch (error) {
      throw error;
    }
  };

  const signup = async (email: string, password: string, firstName?: string, lastName?: string) => {
    try {
      const userData = await authAPI.signup({ email, password, first_name: firstName, last_name: lastName });
      setUser(userData);
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user_cache');
    localStorage.removeItem('user_cache_time');
    // Clear playground chat history on logout
    localStorage.removeItem('agent_playground_state');
    setUser(null);
  };

  const resetPassword = async (email: string) => {
    try {
      await authAPI.resetPasswordRequest({ email });
    } catch (error) {
      throw error;
    }
  };

  const isAdmin = () => {
    if (!user) return false;
    
    // Define admin emails - same as backend
    const adminEmails = [
      "lokesh.jothiram@tringapps.net",
      "itslokelokesh06@gmail.com"
    ];
    
    return adminEmails.includes(user.email);
  };

  const refreshUser = async () => {
    try {
      const userData = await authAPI.getCurrentUser();
      setUser(userData);
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  const value = {
    user,
    loading,
    login,
    signup,
    logout,
    resetPassword,
    isAdmin,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
