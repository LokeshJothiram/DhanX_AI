import { useState, useEffect, useCallback } from 'react';
import { connectionsAPI, transactionsAPI } from '../services/api';

export interface ProcessedTransaction {
  id: string;
  type: 'income' | 'expense';
  description: string;
  amount: number;
  date: string;
  category: string;
  source?: string;
}

export interface IncomeTransaction {
  date: string;
  source: string;
  amount: number;
  type: string;
}

export interface SpendingTransaction {
  date: string;
  description: string;
  amount: number;
  category: string;
}

interface UseTransactionsReturn {
  // All transactions (combined)
  allTransactions: ProcessedTransaction[];
  // Income transactions only
  incomeTransactions: IncomeTransaction[];
  // Spending transactions only
  spendingTransactions: SpendingTransaction[];
  // Manual transactions
  manualTransactions: any[];
  // Connections
  connections: any[];
  // Loading state
  loading: boolean;
  // Error state
  error: string | null;
  // Refresh function
  refresh: () => Promise<void>;
  // Last updated timestamp
  lastUpdated: number | null;
}

const mapDescriptionToCategory = (description: string): string => {
  const desc = description.toLowerCase();
  if (desc.includes('food') || desc.includes('grocery') || desc.includes('restaurant') || desc.includes('meal')) {
    return 'Food';
  } else if (desc.includes('transport') || desc.includes('uber') || desc.includes('taxi') || desc.includes('fuel')) {
    return 'Transport';
  } else if (desc.includes('rent') || desc.includes('housing') || desc.includes('utilities')) {
    return 'Housing';
  } else if (desc.includes('shopping') || desc.includes('store') || desc.includes('mall')) {
    return 'Shopping';
  } else if (desc.includes('entertainment') || desc.includes('movie') || desc.includes('game')) {
    return 'Entertainment';
  } else if (desc.includes('health') || desc.includes('medical') || desc.includes('pharmacy')) {
    return 'Health';
  } else {
    return 'Other';
  }
};

export const useTransactions = (autoRefresh: boolean = true, refreshInterval: number = 10000): UseTransactionsReturn => {
  const [allTransactions, setAllTransactions] = useState<ProcessedTransaction[]>([]);
  const [incomeTransactions, setIncomeTransactions] = useState<IncomeTransaction[]>([]);
  const [spendingTransactions, setSpendingTransactions] = useState<SpendingTransaction[]>([]);
  const [manualTransactions, setManualTransactions] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const processTransactions = useCallback((connectionsData: any[], manualTxns: any[]) => {
    const processed: ProcessedTransaction[] = [];
    const income: IncomeTransaction[] = [];
    const spending: SpendingTransaction[] = [];
    const currentTimestamp = Date.now();

    // Find the earliest connection created_at date to filter transactions
    // Only show transactions AFTER the first connection was created
    let earliestConnectionDate: Date | null = null;
    const connectedConnections = connectionsData.filter(conn => conn.status === 'connected' && conn.created_at);
    if (connectedConnections.length > 0) {
      const connectionDates = connectedConnections
        .map(conn => new Date(conn.created_at))
        .filter(date => !isNaN(date.getTime()));
      if (connectionDates.length > 0) {
        earliestConnectionDate = new Date(Math.min(...connectionDates.map(d => d.getTime())));
        console.log(`📅 Filtering transactions to show only after earliest connection date: ${earliestConnectionDate.toISOString()}`);
      }
    }

    // Helper function to check if a transaction date is after the earliest connection date
    const isAfterConnectionDate = (txnDate: string | Date): boolean => {
      if (!earliestConnectionDate) return true; // No connections = show all transactions
      const date = typeof txnDate === 'string' ? new Date(txnDate) : txnDate;
      return date >= earliestConnectionDate;
    };

    // Process connection transactions - optimized with early limits
    // Handle both "transactions" (for UPI files) and "entries" (for cash_income.json)
    for (const connection of connectionsData) {
      const connData = connection.connection_data;
      
      // Check if connection_data is missing, null, or doesn't have the expected structure
      const hasTransactions = connData?.transactions && Array.isArray(connData.transactions) && connData.transactions.length > 0;
      const hasEntries = connData?.entries && Array.isArray(connData.entries) && connData.entries.length > 0;
      const hasNoData = !connData || (!hasTransactions && !hasEntries);
      
      // Debug: Log what we found
      if (connData) {
        console.log(`🔍 Processing "${connection.name}":`, {
          has_connection_data: !!connData,
          has_transactions_array: !!connData.transactions,
          transactions_length: connData.transactions?.length || 0,
          has_entries_array: !!connData.entries,
          entries_length: connData.entries?.length || 0,
          connection_data_keys: Object.keys(connData)
        });
      }
      
      if (hasNoData) {
        // Only warn if connection has been synced but has no data (indicates a problem)
        // If never synced, it's expected to have no data
        if (connection.last_sync) {
          console.warn(`⚠️ Connection "${connection.name}" has been synced but has no transaction data`, {
            id: connection.id,
            last_sync: connection.last_sync,
            connection_data: connData,
            connection_data_type: typeof connData,
            has_transactions: hasTransactions,
            has_entries: hasEntries,
            transactions_array_exists: !!connData?.transactions,
            transactions_length: connData?.transactions?.length || 0,
            entries_array_exists: !!connData?.entries,
            entries_length: connData?.entries?.length || 0
          });
          console.warn(`💡 This usually means the sync failed or the mock data file is missing. Try syncing the connection again.`);
        } else {
          console.debug(`ℹ️ Connection "${connection.name}" has no connection_data (not synced yet)`);
        }
        continue;
      }
      
      // Process transactions (for UPI files like phonepe.json, gpay.json, etc.)
      if (connData.transactions && Array.isArray(connData.transactions)) {
        const connTransactions = connData.transactions;
        // Limit to recent 100 transactions per connection (reduced for better performance)
        const recentTransactions = connTransactions.slice(0, 100);
        
        for (const txn of recentTransactions) {
          if (!txn || typeof txn !== 'object') continue;
          
          // Handle both timestamp and date fields, support future dates
          let date: string;
          let txnDateObj: Date;
          if (txn.timestamp) {
            txnDateObj = new Date(txn.timestamp);
            date = txnDateObj.toISOString().split('T')[0];
          } else if (txn.date) {
            txnDateObj = new Date(txn.date);
            date = txnDateObj.toISOString().split('T')[0];
          } else {
            txnDateObj = new Date(currentTimestamp);
            date = txnDateObj.toISOString().split('T')[0];
          }
          
          // Filter: Only include transactions after connection creation date
          if (!isAfterConnectionDate(txnDateObj)) {
            continue; // Skip transactions before connection was created
          }
          
          if (txn.type === 'credit') {
            // Income transaction
            const incomeTxn: IncomeTransaction = {
              date,
              source: `${connection.name} - ${txn.description || 'Transaction'}`,
              amount: txn.amount || 0,
              type: connection.type === 'UPI' ? 'upi' : connection.type === 'Bank Account' ? 'bank' : 'other',
            };
            income.push(incomeTxn);
            
            processed.push({
              id: `conn-${connection.id}-${txn.id || txn.timestamp || currentTimestamp}`,
              type: 'income',
              description: txn.description || 'Transaction',
              amount: txn.amount || 0,
              date,
              category: connection.type || 'Other',
              source: connection.name,
            });
          } else if (txn.type === 'debit') {
            // Expense transaction
            const category = mapDescriptionToCategory(txn.description || 'Transaction');
            const spendingTxn: SpendingTransaction = {
              date,
              description: txn.description || 'Transaction',
              amount: txn.amount || 0,
              category,
            };
            spending.push(spendingTxn);
            
            processed.push({
              id: `conn-${connection.id}-${txn.id || txn.timestamp || currentTimestamp}`,
              type: 'expense',
              description: txn.description || 'Transaction',
              amount: txn.amount || 0,
              date,
              category,
              source: connection.name,
            });
          }
        }
      }
      
      // Process entries (for cash_income.json)
      if (connData.entries && Array.isArray(connData.entries)) {
        const entries = connData.entries;
        // Limit to recent 100 entries
        const recentEntries = entries.slice(0, 100);
        
        for (const entry of recentEntries) {
          if (!entry || typeof entry !== 'object') continue;
          
          // All entries in cash_income are income transactions
          // Handle date field, support future dates
          let date: string;
          let entryDateObj: Date;
          if (entry.date) {
            entryDateObj = new Date(entry.date);
            date = entryDateObj.toISOString().split('T')[0];
          } else {
            entryDateObj = new Date(currentTimestamp);
            date = entryDateObj.toISOString().split('T')[0];
          }
          
          // Filter: Only include transactions after connection creation date
          if (!isAfterConnectionDate(entryDateObj)) {
            continue; // Skip transactions before connection was created
          }
          
          const incomeTxn: IncomeTransaction = {
            date,
            source: `${connection.name} - ${entry.description || entry.category || 'Cash Income'}`,
            amount: entry.amount || 0,
            type: 'cash',
          };
          income.push(incomeTxn);
          
          processed.push({
            id: `conn-${connection.id}-${entry.id || currentTimestamp}`,
            type: 'income',
            description: entry.description || entry.category || 'Cash Income',
            amount: entry.amount || 0,
            date,
            category: entry.category || 'Income',
            source: connection.name,
          });
        }
      }
    }

    // Process manual transactions
    // Filter manual transactions to only show those after earliest connection date
    for (const txn of manualTxns) {
      const txnDate = new Date(txn.transaction_date);
      const date = txnDate.toISOString().split('T')[0];
      
      // Filter: Only include manual transactions after connection creation date
      if (!isAfterConnectionDate(txnDate)) {
        continue; // Skip transactions before connection was created
      }
      
      if (txn.type === 'income') {
        const incomeTxn: IncomeTransaction = {
          date,
          source: txn.description || txn.source || 'Manual Entry',
          amount: Number(txn.amount),
          type: txn.source || 'manual',
        };
        income.push(incomeTxn);
        
        processed.push({
          id: txn.id,
          type: 'income',
          description: txn.description || txn.source || 'Manual Entry',
          amount: Number(txn.amount),
          date,
          category: txn.category || 'Other',
          source: 'Manual',
        });
      } else if (txn.type === 'expense') {
        const category = txn.category || mapDescriptionToCategory(txn.description || 'Transaction');
        const spendingTxn: SpendingTransaction = {
          date,
          description: txn.description || 'Transaction',
          amount: Number(txn.amount),
          category,
        };
        spending.push(spendingTxn);
        
        processed.push({
          id: txn.id,
          type: 'expense',
          description: txn.description || 'Transaction',
          amount: Number(txn.amount),
          date,
          category,
          source: 'Manual',
        });
      }
    }

    // Sort all by date (newest first)
    processed.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });

    income.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });

    spending.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });

    return { processed, income, spending };
  }, []);

  const loadTransactions = useCallback(async (silentRefresh: boolean = false) => {
    // Check if we have a token before making requests
    const token = localStorage.getItem('token');
    if (!token) {
      if (!silentRefresh) {
        setLoading(false);
      }
      return;
    }

    try {
      if (!silentRefresh) {
        setLoading(true);
        setError(null);
      }
      
      // Load all data in parallel - optimized with proper limits
      const [connectionsData, manualTxns] = await Promise.all([
        connectionsAPI.getConnections(),
        transactionsAPI.getTransactions(undefined, 300), // Reduced limit for faster processing
      ]);

      setConnections(connectionsData);
      setManualTransactions(manualTxns);

      // Debug: Log connection data to see what we're getting
      console.log('🔍 Connections data:', connectionsData);
      connectionsData.forEach((conn: any) => {
        if (conn.connection_data) {
          const txnCount = conn.connection_data.transactions?.length || 0;
          const entryCount = conn.connection_data.entries?.length || 0;
          console.log(`📊 Connection "${conn.name}": ${txnCount} transactions, ${entryCount} entries`);
          console.log(`📋 Connection "${conn.name}" connection_data keys:`, Object.keys(conn.connection_data));
          console.log(`📋 Connection "${conn.name}" full connection_data:`, JSON.stringify(conn.connection_data, null, 2).substring(0, 500));
          if (txnCount > 0) {
            console.log(`📋 First transaction sample:`, conn.connection_data.transactions[0]);
          } else {
            console.warn(`⚠️ Connection "${conn.name}" has empty transactions array!`);
            console.warn(`⚠️ Transactions array type:`, typeof conn.connection_data.transactions, Array.isArray(conn.connection_data.transactions));
          }
          if (entryCount > 0) {
            console.log(`📋 First entry sample:`, conn.connection_data.entries[0]);
          } else {
            console.warn(`⚠️ Connection "${conn.name}" has empty entries array!`);
          }
        } else {
          // Only warn if connection has been synced but has no data (indicates a problem)
          // If never synced, it's expected to have no data
          if (conn.last_sync) {
            console.warn(`⚠️ Connection "${conn.name}" has been synced but has no connection_data`, {
              id: conn.id,
              name: conn.name,
              type: conn.type,
              status: conn.status,
              last_sync: conn.last_sync,
              connection_data: conn.connection_data,
              connection_data_type: typeof conn.connection_data
            });
            console.warn(`💡 This usually means the sync failed or the mock data file is missing. Try syncing again.`);
          } else {
            console.debug(`ℹ️ Connection "${conn.name}" has no connection_data (not synced yet)`);
          }
        }
      });

      // Process all transactions
      const { processed, income, spending } = processTransactions(connectionsData, manualTxns);
      
      // Debug: Log processed results
      console.log(`✅ Processed: ${processed.length} total, ${income.length} income, ${spending.length} spending`);

      setAllTransactions(processed);
      setIncomeTransactions(income);
      setSpendingTransactions(spending);
      setLastUpdated(Date.now());
    } catch (err: any) {
      // Don't log errors for 401/403 as they're handled by the interceptor
      if (err.response?.status !== 401 && err.response?.status !== 403) {
        const errorMessage = err.response?.data?.detail || err.message || 'Failed to load transactions';
        setError(errorMessage);
        console.error('Error loading transactions:', err);
      }
      
      // Set empty arrays on error (but don't clear if it's an auth error - let interceptor handle it)
      if (!silentRefresh && err.response?.status !== 401 && err.response?.status !== 403) {
        setAllTransactions([]);
        setIncomeTransactions([]);
        setSpendingTransactions([]);
      }
    } finally {
      if (!silentRefresh) {
        setLoading(false);
      }
    }
  }, [processTransactions]);

  // Initial load - trigger immediately when token is available
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // Load immediately when token is available
      loadTransactions(false);
    } else {
      // No token, set loading to false and clear data
      setLoading(false);
      setAllTransactions([]);
      setIncomeTransactions([]);
      setSpendingTransactions([]);
      setManualTransactions([]);
      setConnections([]);
    }
  }, [loadTransactions]);

  // Listen for storage events to detect token changes (e.g., login)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'token') {
        const token = localStorage.getItem('token');
        if (token) {
          // Token was just set - load data immediately
          loadTransactions(false);
        } else {
          // Token was removed - clear data
          setAllTransactions([]);
          setIncomeTransactions([]);
          setSpendingTransactions([]);
          setManualTransactions([]);
          setConnections([]);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Also listen for custom event for same-window token changes (login)
    const handleTokenChange = () => {
      const token = localStorage.getItem('token');
      if (token) {
        loadTransactions(false);
      }
    };
    
    window.addEventListener('tokenChanged', handleTokenChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('tokenChanged', handleTokenChange);
    };
  }, [loadTransactions]);

  // Auto-refresh in background - optimized with longer interval
  useEffect(() => {
    if (!autoRefresh) return;
    
    // Use longer refresh interval for better performance (default 30 seconds instead of 10)
    const effectiveInterval = refreshInterval > 10000 ? refreshInterval : 30000;
    
    const interval = setInterval(() => {
      loadTransactions(true); // Silent refresh
    }, effectiveInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, loadTransactions]);

  return {
    allTransactions,
    incomeTransactions,
    spendingTransactions,
    manualTransactions,
    connections,
    loading,
    error,
    refresh: () => loadTransactions(false),
    lastUpdated,
  };
};

