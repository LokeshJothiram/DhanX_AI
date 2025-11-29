import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useTransactions } from '../hooks/useTransactions';
import { goalsAPI, connectionsAPI } from '../services/api';

interface DataContextType {
  // Transactions data (from useTransactions hook)
  allTransactions: any[];
  incomeTransactions: any[];
  spendingTransactions: any[];
  connections: any[];
  manualTransactions: any[];
  transactionsLoading: boolean;
  transactionsError: string | null;
  refreshTransactions: () => Promise<void>;
  
  // Goals data
  goals: any[];
  goalsLoading: boolean;
  goalsError: string | null;
  refreshGoals: () => Promise<void>;
  
  // Connections data
  connectionsData: any[];
  connectionsLoading: boolean;
  connectionsError: string | null;
  refreshConnections: () => Promise<void>;
  
  // Overall loading state
  isInitializing: boolean;
  isReady: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};

interface DataProviderProps {
  children: React.ReactNode;
}

export const DataProvider: React.FC<DataProviderProps> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [isInitializing, setIsInitializing] = useState(true);
  
  // Use shared transactions hook - optimized with longer refresh interval
  const {
    allTransactions,
    incomeTransactions,
    spendingTransactions,
    connections: transactionsConnections,
    manualTransactions,
    loading: transactionsLoading,
    error: transactionsError,
    refresh: refreshTransactions,
  } = useTransactions(true, 30000); // 30 seconds refresh interval for better performance
  
  // Goals state
  const [goals, setGoals] = useState<any[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  
  // Use ref to track loading state to prevent concurrent requests
  const isLoadingRef = useRef(false);
  
  // Reuse connections from useTransactions hook to avoid duplicate API calls
  const connectionsData = transactionsConnections;
  const connectionsLoading = transactionsLoading;
  const connectionsError = transactionsError;
  
  // Load goals
  const loadGoals = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    // Prevent concurrent loads using ref
    if (isLoadingRef.current) return;
    
    try {
      isLoadingRef.current = true;
      setGoalsLoading(true);
      setGoalsError(null);
      const data = await goalsAPI.getGoals(true);
      setGoals(Array.isArray(data) ? data : []);
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to load goals';
      setGoalsError(errorMessage);
      console.error('Error loading goals:', err);
      setGoals([]);
    } finally {
      setGoalsLoading(false);
      isLoadingRef.current = false;
    }
  }, []);
  
  // Initial data load - start immediately when token is available (don't wait for auth state)
  useEffect(() => {
    const token = localStorage.getItem('token');
    
    if (token) {
      // Start loading data immediately when token is available
      setIsInitializing(true);
      
      // Load goals in parallel with transactions (which are already loading via useTransactions)
      // This starts immediately, not waiting for auth state
      // Use Promise.allSettled to prevent one failure from blocking the other
      Promise.allSettled([
        loadGoals(),
        // Transactions are loaded by useTransactions hook automatically
        // Connections are also loaded by useTransactions hook, so no duplicate call needed
      ]).finally(() => {
        setIsInitializing(false);
      });
    } else {
      // No token - clear data
      setGoals([]);
      setIsInitializing(false);
    }
  }, [loadGoals]); // Only depend on loadGoals, not user/authLoading

  // Listen for token changes to trigger immediate data loading
  useEffect(() => {
    const handleTokenChange = () => {
      const token = localStorage.getItem('token');
      if (token) {
        // Token was just set - load goals immediately
        setIsInitializing(true);
        loadGoals().finally(() => {
          setIsInitializing(false);
        });
      } else {
        // Token was removed - clear data
        setGoals([]);
        setIsInitializing(false);
      }
    };

    window.addEventListener('tokenChanged', handleTokenChange);
    window.addEventListener('storage', (e) => {
      if (e.key === 'token') {
        handleTokenChange();
      }
    });

    return () => {
      window.removeEventListener('tokenChanged', handleTokenChange);
    };
  }, [loadGoals]);
  
  // Also trigger when user state changes (for login flow)
  // Use a ref to track if we've already loaded goals to prevent loops
  const goalsLoadedRef = useRef(false);
  
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (user && token && !authLoading) {
      // User just logged in - ensure data is loaded (only once)
      if (!goalsLoadedRef.current && !goalsLoading) {
        goalsLoadedRef.current = true;
        loadGoals();
      }
    } else if (!user && !token) {
      // User logged out - clear data and reset ref
      setGoals([]);
      goalsLoadedRef.current = false;
      setIsInitializing(false);
    }
  }, [user, authLoading, goalsLoading, loadGoals]);
  
  // Background refresh for goals (every 60 seconds - reduced frequency for better performance)
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    // Only set up interval if not already loading
    const interval = setInterval(() => {
      // loadGoals already checks isLoadingRef internally
      loadGoals();
    }, 60000); // Refresh every 60 seconds - less frequent for better performance
    
    return () => clearInterval(interval);
  }, [loadGoals]);
  
  const refreshGoals = useCallback(async () => {
    await loadGoals();
  }, [loadGoals]);
  
  const refreshConnections = useCallback(async () => {
    // Refresh connections by refreshing transactions (which includes connections)
    await refreshTransactions();
  }, [refreshTransactions]);
  
  const isReady = !isInitializing && user !== null;
  
  const value: DataContextType = {
    // Transactions
    allTransactions,
    incomeTransactions,
    spendingTransactions,
    connections: transactionsConnections,
    manualTransactions,
    transactionsLoading,
    transactionsError,
    refreshTransactions,
    
    // Goals
    goals,
    goalsLoading,
    goalsError,
    refreshGoals,
    
    // Connections
    connectionsData,
    connectionsLoading,
    connectionsError,
    refreshConnections,
    
    // Overall state
    isInitializing,
    isReady,
  };
  
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

