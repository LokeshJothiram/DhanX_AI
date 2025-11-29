import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Toast } from '../components/ToastNotification';

interface NotificationContextType {
  showToast: (message: string, type?: Toast['type'], title?: string, duration?: number) => void;
  showSuccess: (message: string, title?: string) => void;
  showError: (message: string, title?: string) => void;
  showWarning: (message: string, title?: string) => void;
  showInfo: (message: string, title?: string) => void;
  showAgentAction: (message: string, title?: string) => void;
  toasts: Toast[];
  removeToast: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (
      message: string,
      type: Toast['type'] = 'info',
      title?: string,
      duration: number = 5000
    ) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      const newToast: Toast = {
        id,
        message,
        type,
        title,
        duration,
      };

      setToasts((prev) => [...prev, newToast]);

      // Auto-remove after duration
      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const showSuccess = useCallback(
    (message: string, title?: string) => {
      showToast(message, 'success', title || 'Success', 4000);
    },
    [showToast]
  );

  const showError = useCallback(
    (message: string, title?: string) => {
      showToast(message, 'error', title || 'Error', 6000);
    },
    [showToast]
  );

  const showWarning = useCallback(
    (message: string, title?: string) => {
      showToast(message, 'warning', title || 'Warning', 5000);
    },
    [showToast]
  );

  const showInfo = useCallback(
    (message: string, title?: string) => {
      showToast(message, 'info', title || 'Info', 4000);
    },
    [showToast]
  );

  const showAgentAction = useCallback(
    (message: string, title?: string) => {
      showToast(message, 'agent', title || '🤖 AI Agent Action', 6000);
    },
    [showToast]
  );

  return (
    <NotificationContext.Provider
      value={{
        showToast,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        showAgentAction,
        toasts,
        removeToast,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
};

