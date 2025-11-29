import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LinkIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlusIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { connectionsAPI } from '../services/api';
import { useData } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';
import AlertModal from '../components/AlertModal';

interface Connection {
  id: string;
  name: string;
  type: string;
  status: string;
  last_sync: string | null;
  icon: string | null;
  connection_data?: any;
}

const ConnectionsPage: React.FC = () => {
  const { t } = useLanguage();
  const { showAgentAction, showSuccess, showInfo } = useNotification();
  const location = useLocation();
  
  // Use pre-loaded connections from DataContext
  const { connectionsData: sharedConnections, connectionsLoading, connectionsError, refreshConnections, refreshGoals, refreshTransactions } = useData();
  
  const [connections, setConnections] = useState<Connection[]>([]);
  const [availableConnections, setAvailableConnections] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connectionDataDisplay, setConnectionDataDisplay] = useState<{name: string, data: any} | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  
  // Alert modal state
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
  });

  // Load available connections using current connections state - memoized for performance
  const loadAvailableConnections = useCallback(async (currentConnections?: Connection[]) => {
    try {
      // Use memoized/cached available connections if possible
      const data = await connectionsAPI.getAvailableConnections();
      
      // Use provided connections or fallback to empty array
      const connectionsToUse = currentConnections || [];
      
      // Normalize names for comparison (trim whitespace, case-insensitive)
      // Use Set for O(1) lookup instead of array includes
      const connectedNames = new Set(
        connectionsToUse.map(c => (c.name || '').trim().toLowerCase())
      );
      
      const available = Array.isArray(data) && data.length > 0
        ? data.filter((conn: any) => {
            const connName = (conn.name || '').trim().toLowerCase();
            return connName && !connectedNames.has(connName);
          })
        : [];
      
      setAvailableConnections(available);
    } catch (err: any) {
      console.error('Error loading available connections:', err);
      // On error, still try to show available connections if API data exists
      // This handles cases where the API might be temporarily unavailable
      setAvailableConnections([]);
    }
  }, []); // Remove connections from dependency array since we pass it as parameter

  // Update connections when shared data changes - use background loader only
  useEffect(() => {
    // Always use shared data from context (background loaded)
    setConnections(sharedConnections);
    setError(connectionsError);
    // Load available connections with updated connections
    if (!connectionsLoading) {
      loadAvailableConnections(sharedConnections);
    }
  }, [sharedConnections, connectionsLoading, connectionsError, loadAvailableConnections]);

  // Recalculate available connections when navigating back to page
  useEffect(() => {
    if (location.pathname === '/connections' && !connectionsLoading && sharedConnections.length >= 0) {
      loadAvailableConnections(sharedConnections);
    }
  }, [location.pathname, sharedConnections, connectionsLoading, loadAvailableConnections]);

  const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  const handleConnect = async (connection: { name: string; type: string; icon: string }) => {
    if (connectingId) return; // Prevent double clicks
    
    const connectionKey = `${connection.name}-${connection.type}`;
    setConnectingId(connectionKey);
    setError(null);
    
    try {
      const newConnection = await connectionsAPI.connect({
        name: connection.name,
        type: connection.type,
        icon: connection.icon,
      });
      
      // Immediately update local state for faster UI response
      const updatedConnections = [...connections, newConnection];
      setConnections(updatedConnections);
      
      // Refresh connections from context in background
      refreshConnections().then(() => {
        // After context updates, reload available connections
        loadAvailableConnections(updatedConnections);
      });
      
      // Also reload available connections immediately
      await loadAvailableConnections(updatedConnections);
      
      // Refresh goals immediately (in case they were created synchronously)
      refreshGoals().catch(err => console.error('Error refreshing goals:', err));
      
      // Refresh goals again after a delay to catch background-created goals
      // Background task typically takes 2-5 seconds, so wait 6 seconds to be safe
      setTimeout(() => {
        refreshGoals().catch(err => console.error('Error refreshing goals (delayed):', err));
      }, 6000);
      
      // Display the connection data in JSON format
      setConnectionDataDisplay({
        name: newConnection.name,
        data: newConnection
      });
      
      // Show success message
      setAlertModal({
        isOpen: true,
        title: t('common.success'),
        message: `Successfully connected to ${connection.name}! Your transactions will be synced automatically. Goals will be processed in the background.`,
        type: 'success',
      });
      
      // Show toast notification about auto-goal creation
      showInfo(
        'AI is analyzing your income patterns and will create personalized goals for you. Check the Goals page in a few seconds!',
        '🤖 Analyzing Your Finances'
      );
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || t('connections.failedToConnect');
      setError(errorMessage);
      console.error('Error connecting:', err);
      setAlertModal({
        isOpen: true,
        title: t('common.error'),
        message: errorMessage,
        type: 'error',
      });
      // Refresh on error to get correct state
      await refreshConnections();
    } finally {
      setConnectingId(null);
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      setError(null);
      const response = await connectionsAPI.disconnect(id);
      // The backend returns connection_data when disconnecting
      console.log('Disconnected connection data:', response.connection_data);
      
      // Immediately update local state for faster UI response
      const updatedConnections = connections.filter(c => c.id !== id);
      setConnections(updatedConnections);
      
      // Refresh connections from context in background
      refreshConnections().then(() => {
        // After context updates, reload available connections
        loadAvailableConnections(updatedConnections);
      });
      
      // Also reload available connections immediately
      await loadAvailableConnections(updatedConnections);
    } catch (err: any) {
      setError(err.response?.data?.detail || t('connections.failedToDisconnect'));
      console.error('Error disconnecting:', err);
      setAlertModal({
        isOpen: true,
        title: t('common.error'),
        message: t('connections.failedToDisconnect'),
        type: 'error',
      });
      // Refresh on error to get correct state
      await refreshConnections();
    }
  };

  const handleSync = async (id: string) => {
    if (syncingId) return; // Prevent double clicks
    
    setSyncingId(id);
    setError(null);
    
    try {
      await connectionsAPI.sync(id);
      // Refresh all data: connections, transactions, and goals
      await Promise.all([
        refreshConnections(),
        refreshTransactions(),
        refreshGoals()
      ]);
      
      // Show success message
      setAlertModal({
        isOpen: true,
        title: t('common.success'),
        message: 'Connection synced successfully! New transactions have been loaded and income has been allocated to your goals.',
        type: 'success',
      });
      
      // Show toast notification about income allocation
      showAgentAction(
        'Income detected! AI automatically allocated funds to your goals. Check your Goals page to see progress!',
        '💰 Income Auto-Allocated'
      );
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || t('connections.failedToSync');
      setError(errorMessage);
      console.error('Error syncing:', err);
      setAlertModal({
        isOpen: true,
        title: t('common.error'),
        message: errorMessage,
        type: 'error',
      });
    } finally {
      setSyncingId(null);
    }
  };

  const formatLastSync = (lastSync: string | null) => {
    if (!lastSync) return t('connections.never');
    const date = new Date(lastSync);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('connections.justNow');
    if (diffMins < 60) return `${diffMins} ${t('connections.minutesAgo')}`;
    if (diffHours < 24) return `${diffHours} ${t('connections.hoursAgo')}`;
    if (diffDays < 7) return `${diffDays} ${t('connections.daysAgo')}`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">{t('connections.title')}</h1>
        <p className="text-white/70">{t('connections.subtitle')}</p>
      </div>

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl backdrop-blur-sm"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-red-400 font-medium mb-1">{t('connections.errorLoading')}</p>
              <p className="text-xs text-red-300/80">{error}</p>
            </div>
          <button
            onClick={() => {
              setError(null);
              refreshConnections(); // Retry on dismiss
            }}
              className="ml-4 text-xs text-red-300 hover:text-red-200 underline"
          >
              {t('connections.retry')}
          </button>
        </div>
        </motion.div>
      )}

      {/* Connection Data Display */}
      {connectionDataDisplay && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">
              {t('connections.connectionData')}: {connectionDataDisplay.name}
            </h2>
            <button
              onClick={() => setConnectionDataDisplay(null)}
              className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-all"
            >
              <XCircleIcon className="h-5 w-5" />
            </button>
          </div>
          <div className="bg-slate-950/50 rounded-lg p-4 border border-violet-500/10 overflow-auto max-h-96">
            <pre className="text-sm text-white/80 font-mono whitespace-pre-wrap break-words">
              {JSON.stringify(connectionDataDisplay.data, null, 2)}
            </pre>
          </div>
        </motion.div>
      )}

      {/* Connected Accounts */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4">{t('connections.connectedAccounts')}</h2>
        {connections.length === 0 ? (
          <div className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-8 border border-violet-500/20 shadow-xl text-center">
            <p className="text-white/60">{t('connections.noConnections')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {connections.map((connection, index) => (
            <motion.div
              key={connection.id}
              initial="hidden"
              animate="visible"
              variants={fadeInUp}
              transition={{ delay: index * 0.1 }}
              className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl hover:border-violet-400/30 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-4">
                  <div className="text-4xl">{connection.icon || '💳'}</div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{connection.name}</h3>
                    <p className="text-sm text-white/60">{connection.type}</p>
                  </div>
                </div>
                {connection.status === 'connected' ? (
                  <CheckCircleIcon className="h-6 w-6 text-green-400" />
                ) : (
                  <XCircleIcon className="h-6 w-6 text-yellow-400" />
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-violet-500/20">
                <div>
                  <p className="text-xs text-white/60">{t('connections.lastSynced')}</p>
                  <p className="text-sm font-medium text-white">
                    {formatLastSync(connection.last_sync)}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  {connection.type !== 'Manual' && (
                    <button
                      onClick={() => handleSync(connection.id)}
                      disabled={syncingId === connection.id}
                      className="p-2 bg-white/10 backdrop-blur-sm hover:bg-white/20 rounded-lg border border-transparent hover:border-violet-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      title={syncingId === connection.id ? t('connections.syncing') : t('connections.syncNow')}
                    >
                      {syncingId === connection.id ? (
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <ArrowPathIcon className="h-4 w-4 text-white" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => handleDisconnect(connection.id)}
                    className="px-3 py-1.5 text-sm bg-red-500/20 backdrop-blur-sm hover:bg-red-500/30 text-red-400 rounded-lg border border-red-500/30 transition-all"
                  >
                    {t('connections.disconnect')}
                  </button>
                </div>
              </div>
            </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Available Connections */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
      >
        <h2 className="text-xl font-bold text-white mb-4">{t('connections.availableConnections')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {availableConnections.length === 0 ? (
            <p className="text-white/60 col-span-full text-center py-4">
              {t('connections.allConnected')}
            </p>
          ) : (
            availableConnections.map((connection, index) => {
              const connectionKey = `${connection.name}-${connection.type}`;
              const isConnecting = connectingId === connectionKey;
              
              return (
                <button
                  key={index}
                  onClick={() => handleConnect(connection)}
                  disabled={isConnecting || !!connectingId}
                  className="flex items-center space-x-4 p-4 bg-white/5 backdrop-blur-sm hover:bg-white/10 rounded-lg border border-violet-500/20 hover:border-violet-400/30 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="text-3xl">{connection.icon}</div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">{connection.name}</h3>
                    <p className="text-sm text-white/60">{connection.type}</p>
                  </div>
                  {isConnecting ? (
                    <svg className="animate-spin h-5 w-5 text-violet-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <PlusIcon className="h-5 w-5 text-violet-400" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </motion.div>

      {/* Connection Info */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl backdrop-blur-sm"
      >
        <div className="flex items-start space-x-3">
          <LinkIcon className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-white/80 mb-1">{t('connections.secureConnection')}</p>
            <p className="text-sm text-white/70">
              {t('connections.secureConnectionText')}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Alert Modal */}
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
    </div>
  );
};

export default ConnectionsPage;

