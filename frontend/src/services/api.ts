import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000, // 15 second timeout - balanced for performance
  // Enable response compression
  decompress: true,
});

// Add token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle authentication errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle both 401 (Unauthorized) and 403 (Forbidden) as authentication failures
    if (error.response?.status === 401 || error.response?.status === 403) {
      const currentPath = window.location.pathname;
      const token = localStorage.getItem('token');
      
      // Only remove token and redirect if:
      // 1. We're not already on login/signup pages
      // 2. We actually have a token (to avoid redirect loops)
      // 3. The error is not from the /auth/me endpoint during initial load (which is used to verify token)
      const isAuthEndpoint = error.config?.url?.includes('/auth/me');
      
      // Don't redirect if it's the initial auth check - let AuthContext handle it
      // Only redirect on subsequent API calls that fail auth
      if (token && currentPath !== '/login' && currentPath !== '/signup') {
        // For /auth/me endpoint, don't remove token or redirect - let AuthContext handle it
        // This prevents logout on page refresh if there's a temporary network issue
        if (!isAuthEndpoint) {
          // For other endpoints, remove token and redirect
          localStorage.removeItem('token');
          // Use a small delay to avoid race conditions with other requests
          setTimeout(() => {
            // Only redirect if we're still not on login page (avoid double redirects)
            if (window.location.pathname !== '/login' && window.location.pathname !== '/signup') {
              window.location.href = '/login';
            }
          }, 100);
        }
        // If it's /auth/me, don't do anything - let AuthContext handle the error
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  signup: async (userData: any) => {
    const response = await api.post('/auth/signup', userData);
    return response.data;
  },

  login: async (credentials: any) => {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  resetPasswordRequest: async (data: any) => {
    const response = await api.post('/auth/reset-password-request', data);
    return response.data;
  },

  resetPassword: async (token: string, newPassword: string) => {
    const response = await api.post('/auth/reset-password', {
      token,
      new_password: newPassword,
    });
    return response.data;
  },

  getCurrentUser: async () => {
    // Use longer timeout for getCurrentUser (30 seconds) as it's critical for auth
    const response = await api.get('/auth/me', {
      timeout: 30000, // 30 seconds
    });
    return response.data;
  },

  updateUser: async (userData: {
    first_name?: string;
    last_name?: string;
    monthly_budget?: number;
    language_preference?: string;
    notification_preferences?: string;
  }) => {
    const response = await api.patch('/auth/me', userData);
    return response.data;
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const response = await api.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return response.data;
  },

  deleteAccount: async () => {
    const response = await api.delete('/auth/me');
    return response.data;
  },

  checkEmail: async (email: string) => {
    const response = await api.get(`/auth/check-email?email=${encodeURIComponent(email)}`);
    return response.data;
  },
};

export const connectionsAPI = {
  getConnections: async (statusFilter?: string) => {
    const params = new URLSearchParams();
    if (statusFilter) {
      params.append('status_filter', statusFilter);
    }
    // Explicitly request transaction data for income/spending pages
    params.append('include_transactions', 'true');
    // Reduced timeout - backend is now optimized
    const response = await api.get(`/connections?${params.toString()}`, {
      timeout: 15000, // 15 seconds - backend optimized for faster response
    });
    return response.data;
  },

  getAvailableConnections: async () => {
    const response = await api.get('/connections/available');
    return response.data;
  },

  connect: async (connectionData: {
    name: string;
    type: string;
    icon?: string;
    connection_data?: any;
  }) => {
    const response = await api.post('/connections', connectionData, {
      timeout: 60000, // 60 seconds - goal creation with LLM can take time
    });
    return response.data;
  },

  disconnect: async (connectionId: string) => {
    const response = await api.delete(`/connections/${connectionId}`);
    return response.data;
  },

  sync: async (connectionId: string) => {
    const response = await api.post(`/connections/${connectionId}/sync`);
    return response.data;
  },

  getConnection: async (connectionId: string) => {
    const response = await api.get(`/connections/${connectionId}`);
    return response.data;
  },

  updateConnection: async (connectionId: string, updateData: any) => {
    const response = await api.patch(`/connections/${connectionId}`, updateData);
    return response.data;
  },
};

export const coachAPI = {
  query: async (query: string) => {
    // Use longer timeout for AI coach (60 seconds) as it involves LLM processing and multiple agents
    const response = await api.post('/api/coach/query', { query }, {
      timeout: 60000, // 60 seconds
    });
    return response.data;
  },
};

export const goalsAPI = {
  getGoals: async (includeCompleted: boolean = true) => {
    // Fast endpoint - use default timeout
    const response = await api.get(`/goals?include_completed=${includeCompleted}`, {
      timeout: 10000, // 10 seconds - goals are typically small datasets
    });
    return response.data;
  },

  createGoal: async (goalData: {
    name: string;
    target: number;
    deadline?: string;
    type?: string;
    saved?: number;
  }) => {
    // Use longer timeout for goal creation (30 seconds)
    const response = await api.post('/goals', goalData, {
      timeout: 30000,
    });
    return response.data;
  },

  updateGoal: async (goalId: string, updateData: {
    name?: string;
    target?: number;
    saved?: number;
    deadline?: string;
    type?: string;
    is_completed?: boolean;
  }) => {
    // Use longer timeout for goal update (30 seconds)
    const response = await api.patch(`/goals/${goalId}`, updateData, {
      timeout: 30000,
    });
    return response.data;
  },

  deleteGoal: async (goalId: string) => {
    const response = await api.delete(`/goals/${goalId}`);
    return response.data;
  },
};

export const transactionsAPI = {
  getTransactions: async (type?: 'income' | 'expense', limit?: number, offset?: number) => {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (limit) params.append('limit', limit.toString());
    if (offset !== undefined) params.append('offset', offset.toString());
    // Reduced timeout - backend optimized with pagination
    const response = await api.get(`/transactions?${params.toString()}`, {
      timeout: 15000, // 15 seconds - backend optimized
    });
    return response.data;
  },

  createTransaction: async (transactionData: {
    amount: number;
    type: 'income' | 'expense';
    category?: string;
    description?: string;
    source?: string;
    transaction_date: string;
  }) => {
    const response = await api.post('/transactions', transactionData);
    return response.data;
  },

  deleteTransaction: async (transactionId: string) => {
    const response = await api.delete(`/transactions/${transactionId}`);
    return response.data;
  },
};

export const investmentsAPI = {
  getInvestments: async () => {
    // Reduced timeout - investments are typically small datasets
    const response = await api.get('/investments', {
      timeout: 10000, // 10 seconds
    });
    return response.data;
  },

  createInvestment: async (investmentData: {
    name: string;
    type: string;
    invested_amount?: number;
    current_value?: number;
    expected_returns?: string;
    risk_level?: string;
    min_investment?: number;
    description?: string;
    icon?: string;
  }) => {
    const response = await api.post('/investments', investmentData);
    return response.data;
  },

  updateInvestment: async (investmentId: string, updateData: {
    name?: string;
    type?: string;
    invested_amount?: number;
    current_value?: number;
    expected_returns?: string;
    risk_level?: string;
    min_investment?: number;
    description?: string;
    icon?: string;
  }) => {
    const response = await api.patch(`/investments/${investmentId}`, updateData);
    return response.data;
  },

  deleteInvestment: async (investmentId: string) => {
    const response = await api.delete(`/investments/${investmentId}`);
    return response.data;
  },
};

export const reportsAPI = {
  getReports: async (period: 'month' | 'quarter' | 'year' = 'month') => {
    // Reduced timeout - backend optimized
    const response = await api.get(`/reports?period=${period}`, {
      timeout: 15000, // 15 seconds
    });
    return response.data;
  },

  getTrends: async (period: 'month' | 'quarter' | 'year' = 'month') => {
    // Reduced timeout - backend optimized
    const response = await api.get(`/reports/trends?period=${period}`, {
      timeout: 15000, // 15 seconds
    });
    return response.data;
  },
};

export const adminAPI = {
  listMockFiles: async () => {
    const response = await api.get('/admin/mock-files');
    return response.data;
  },

  getMockFile: async (filename: string) => {
    const response = await api.get(`/admin/mock-files/${filename}`);
    return response.data;
  },

  addTransaction: async (filename: string, transaction: {
    amount: number;
    type: string;
    description: string;
    timestamp?: string;
    date?: string;
    status?: string;
    category?: string;
  }) => {
    const response = await api.post(`/admin/mock-files/${filename}/transactions`, transaction);
    return response.data;
  },

  updateTransaction: async (filename: string, transactionId: string, transaction: {
    amount?: number;
    type?: string;
    description?: string;
    timestamp?: string;
    date?: string;
    status?: string;
    category?: string;
  }) => {
    const response = await api.put(`/admin/mock-files/${filename}/transactions/${transactionId}`, transaction);
    return response.data;
  },

  deleteTransaction: async (filename: string, transactionId: string) => {
    const response = await api.delete(`/admin/mock-files/${filename}/transactions/${transactionId}`);
    return response.data;
  },

  // User Management
  listUsers: async (skip?: number, limit?: number, search?: string) => {
    const params = new URLSearchParams();
    if (skip !== undefined) params.append('skip', skip.toString());
    if (limit !== undefined) params.append('limit', limit.toString());
    if (search) params.append('search', search);
    const response = await api.get(`/admin/users?${params.toString()}`);
    return response.data;
  },

  getUserDetails: async (userId: string) => {
    const response = await api.get(`/admin/users/${userId}`);
    return response.data;
  },

  updateUser: async (userId: string, userData: {
    first_name?: string;
    last_name?: string;
    monthly_budget?: number;
    language_preference?: string;
    is_active?: boolean;
    is_verified?: boolean;
  }) => {
    const response = await api.patch(`/admin/users/${userId}`, userData);
    return response.data;
  },

  resetUserPassword: async (userId: string, newPassword: string) => {
    const response = await api.post(`/admin/users/${userId}/reset-password`, { new_password: newPassword });
    return response.data;
  },

  deleteUser: async (userId: string) => {
    const response = await api.delete(`/admin/users/${userId}`);
    return response.data;
  },
};

export const healthScoreAPI = {
  getHealthScore: async () => {
    const response = await api.get('/health-score', {
      timeout: 15000, // 15 seconds
    });
    return response.data;
  },

  getStreaks: async () => {
    const response = await api.get('/health-score/streaks', {
      timeout: 10000, // 10 seconds
    });
    return response.data;
  },
};

export const affordabilityAPI = {
  analyze: async (data: { amount: number; description?: string }) => {
    const response = await api.post('/api/affordability/analyze', data, {
      timeout: 30000, // 30 seconds - analysis may take time
    });
    return response.data;
  },
};

export default api;
