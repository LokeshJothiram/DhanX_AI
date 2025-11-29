import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { useNotification } from '../context/NotificationContext';
import AlertModal from '../components/AlertModal';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  DocumentTextIcon,
  ArrowLeftIcon,
  UsersIcon,
  FolderIcon,
  EyeIcon,
  KeyIcon,
  XMarkIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

interface MockFile {
  filename: string;
  type: string;
  size: number;
}

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  timestamp?: string;
  date?: string;
  status?: string;
  category?: string;
}

interface MockFileData {
  transactions?: Transaction[];
  entries?: Transaction[];
  [key: string]: any;
}

interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  monthly_budget?: number;
  language_preference?: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  stats?: {
    connections: number;
    goals: number;
    transactions: number;
    investments: number;
  };
}

interface UserDetails extends User {
  connections: any[];
  goals: any[];
  transactions: any[];
  investments: any[];
  statistics: {
    connections_count: number;
    goals_count: number;
    active_goals_count: number;
    transactions_count: number;
    investments_count: number;
    total_goals_saved: number;
    total_goals_target: number;
    goals_progress_percent: number;
  };
}

const AdminPanelPage: React.FC = () => {
  const { showSuccess, showError } = useNotification();
  
  // Mock data state
  const [files, setFiles] = useState<MockFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileData, setFileData] = useState<MockFileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [formData, setFormData] = useState({
    amount: '',
    type: 'credit',
    description: '',
    timestamp: '',
    date: '',
    status: 'completed',
    category: 'Income',
  });
  
  // User management state
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [showUserEditForm, setShowUserEditForm] = useState(false);
  const [showPasswordResetForm, setShowPasswordResetForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userFormData, setUserFormData] = useState({
    first_name: '',
    last_name: '',
    monthly_budget: '',
    language_preference: 'en',
    is_active: true,
    is_verified: false,
  });
  const [newPassword, setNewPassword] = useState('');
  
  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    type: 'transaction' | 'user' | null;
    id: string | null;
    name?: string;
  }>({
    isOpen: false,
    type: null,
    id: null,
    name: undefined,
  });

  const isCashIncome = selectedFile === 'cash_income.json';
  const transactions = isCashIncome ? (fileData?.entries || []) : (fileData?.transactions || []);

  useEffect(() => {
    loadFiles();
    loadUsers();
  }, []);

  useEffect(() => {
    if (selectedFile) {
      loadFileData(selectedFile);
    }
  }, [selectedFile]);

  const loadFiles = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.listMockFiles();
      setFiles(response.files || []);
    } catch (error: any) {
      showError('Failed to load mock files');
      console.error('Error loading files:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFileData = async (filename: string) => {
    try {
      setLoading(true);
      const data = await adminAPI.getMockFile(filename);
      setFileData(data);
    } catch (error: any) {
      showError('Failed to load file data');
      console.error('Error loading file data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    try {
      const transactionData: any = {
        amount: parseFloat(formData.amount),
        type: formData.type,
        description: formData.description,
        status: formData.status,
      };

      if (isCashIncome) {
        transactionData.date = formData.date || new Date().toISOString().split('T')[0];
        transactionData.category = formData.category;
      } else {
        transactionData.timestamp = formData.timestamp || new Date().toISOString();
      }

      await adminAPI.addTransaction(selectedFile, transactionData);
      showSuccess('Transaction added successfully');
      setShowAddForm(false);
      resetForm();
      await loadFileData(selectedFile);
    } catch (error: any) {
      showError(error.response?.data?.detail || 'Failed to add transaction');
      console.error('Error adding transaction:', error);
    }
  };

  const handleUpdateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !editingTransaction) return;

    try {
      const updateData: any = {};
      if (formData.amount) updateData.amount = parseFloat(formData.amount);
      if (formData.type) updateData.type = formData.type;
      if (formData.description) updateData.description = formData.description;
      if (formData.status) updateData.status = formData.status;

      if (isCashIncome) {
        if (formData.date) updateData.date = formData.date;
        if (formData.category) updateData.category = formData.category;
      } else {
        if (formData.timestamp) updateData.timestamp = formData.timestamp;
      }

      await adminAPI.updateTransaction(selectedFile, editingTransaction.id, updateData);
      showSuccess('Transaction updated successfully');
      setEditingTransaction(null);
      resetForm();
      await loadFileData(selectedFile);
    } catch (error: any) {
      showError(error.response?.data?.detail || 'Failed to update transaction');
      console.error('Error updating transaction:', error);
    }
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    if (!selectedFile) return;
    setDeleteModal({
      isOpen: true,
      type: 'transaction',
      id: transactionId,
    });
  };

  const confirmDeleteTransaction = async () => {
    if (!selectedFile || !deleteModal.id) return;

    try {
      await adminAPI.deleteTransaction(selectedFile, deleteModal.id);
      showSuccess('Transaction deleted successfully');
      setDeleteModal({ isOpen: false, type: null, id: null });
      await loadFileData(selectedFile);
    } catch (error: any) {
      showError(error.response?.data?.detail || 'Failed to delete transaction');
      console.error('Error deleting transaction:', error);
      setDeleteModal({ isOpen: false, type: null, id: null });
    }
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setFormData({
      amount: transaction.amount.toString(),
      type: transaction.type,
      description: transaction.description,
      timestamp: transaction.timestamp || '',
      date: transaction.date || '',
      status: transaction.status || 'completed',
      category: transaction.category || 'Income',
    });
    setShowAddForm(true);
  };

  const resetForm = () => {
    setFormData({
      amount: '',
      type: 'credit',
      description: '',
      timestamp: '',
      date: '',
      status: 'completed',
      category: 'Income',
    });
    setEditingTransaction(null);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      if (dateString.includes('T')) {
        return new Date(dateString).toLocaleString();
      }
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  // User Management Functions
  const loadUsers = async () => {
    try {
      setUsersLoading(true);
      const response = await adminAPI.listUsers(0, 100, userSearch || undefined);
      setUsers(response.users || []);
    } catch (error: any) {
      showError('Failed to load users');
      console.error('Error loading users:', error);
    } finally {
      setUsersLoading(false);
    }
  };

  const loadUserDetails = async (userId: string) => {
    try {
      setUsersLoading(true);
      const data = await adminAPI.getUserDetails(userId);
      setSelectedUser(data);
    } catch (error: any) {
      showError('Failed to load user details');
      console.error('Error loading user details:', error);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      const updateData: any = {};
      if (userFormData.first_name) updateData.first_name = userFormData.first_name;
      if (userFormData.last_name) updateData.last_name = userFormData.last_name;
      if (userFormData.monthly_budget) updateData.monthly_budget = parseFloat(userFormData.monthly_budget);
      if (userFormData.language_preference) updateData.language_preference = userFormData.language_preference;
      updateData.is_active = userFormData.is_active;
      updateData.is_verified = userFormData.is_verified;

      await adminAPI.updateUser(editingUser.id, updateData);
      showSuccess('User updated successfully');
      setShowUserEditForm(false);
      setEditingUser(null);
      await loadUsers();
      if (selectedUser && selectedUser.id === editingUser.id) {
        await loadUserDetails(editingUser.id);
      }
    } catch (error: any) {
      showError(error.response?.data?.detail || 'Failed to update user');
      console.error('Error updating user:', error);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !newPassword) return;

    try {
      await adminAPI.resetUserPassword(editingUser.id, newPassword);
      showSuccess('Password reset successfully');
      setShowPasswordResetForm(false);
      setNewPassword('');
      setEditingUser(null);
    } catch (error: any) {
      showError(error.response?.data?.detail || 'Failed to reset password');
      console.error('Error resetting password:', error);
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    setDeleteModal({
      isOpen: true,
      type: 'user',
      id: userId,
      name: userEmail,
    });
  };

  const confirmDeleteUser = async () => {
    if (!deleteModal.id) return;

    try {
      await adminAPI.deleteUser(deleteModal.id);
      showSuccess('User deleted successfully');
      setDeleteModal({ isOpen: false, type: null, id: null });
      await loadUsers();
      if (selectedUser && selectedUser.id === deleteModal.id) {
        setSelectedUser(null);
      }
    } catch (error: any) {
      showError(error.response?.data?.detail || 'Failed to delete user');
      console.error('Error deleting user:', error);
      setDeleteModal({ isOpen: false, type: null, id: null });
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setUserFormData({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      monthly_budget: user.monthly_budget?.toString() || '',
      language_preference: user.language_preference || 'en',
      is_active: user.is_active,
      is_verified: user.is_verified,
    });
    setShowUserEditForm(true);
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* User Management Section */}
      <div>
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">User Management</h1>
          <p className="text-sm sm:text-base text-white/60">Manage users, view details, and update user information</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 mb-4">
            <input
              type="text"
              placeholder="Search users by email or name..."
              value={userSearch}
              onChange={(e) => {
                setUserSearch(e.target.value);
                if (e.target.value) {
                  loadUsers();
                }
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  loadUsers();
                }
              }}
              className="flex-1 px-3 sm:px-4 py-2 bg-white/5 border border-violet-500/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-sm sm:text-base"
            />
            <button
              onClick={loadUsers}
              className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-500 transition-all text-sm sm:text-base whitespace-nowrap"
            >
              Search
            </button>
          </div>

        {usersLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
            <p className="mt-4 text-white/60">Loading users...</p>
          </div>
        ) : selectedUser ? (
          <div>
            <button
              onClick={() => setSelectedUser(null)}
              className="flex items-center space-x-2 text-white/60 hover:text-white transition-colors mb-4"
            >
              <ArrowLeftIcon className="h-5 w-5" />
              <span>Back to Users</span>
            </button>
            <div className="bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl p-4 sm:p-6 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg sm:text-2xl font-bold text-white mb-2 break-words">
                    {selectedUser.first_name} {selectedUser.last_name}
                  </h2>
                  <p className="text-xs sm:text-sm text-white/60 mb-2 break-all">{selectedUser.email}</p>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                    <span className={`px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium rounded-md ${selectedUser.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {selectedUser.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <span className={`px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium rounded-md ${selectedUser.is_verified ? 'bg-blue-500/20 text-blue-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      {selectedUser.is_verified ? 'Verified' : 'Unverified'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <button
                    onClick={() => handleEditUser(selectedUser)}
                    className="p-2 text-violet-400 hover:text-violet-300 hover:bg-white/5 rounded-lg transition-all"
                    title="Edit User"
                  >
                    <PencilIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => {
                      setEditingUser(selectedUser);
                      setShowPasswordResetForm(true);
                    }}
                    className="p-2 text-yellow-400 hover:text-yellow-300 hover:bg-white/5 rounded-lg transition-all"
                    title="Reset Password"
                  >
                    <KeyIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleDeleteUser(selectedUser.id, selectedUser.email)}
                    className="p-2 text-red-400 hover:text-red-300 hover:bg-white/5 rounded-lg transition-all"
                    title="Delete User"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
                <div className="bg-white/5 rounded-lg p-3 sm:p-4">
                  <p className="text-white/60 text-xs sm:text-sm mb-1">Connections</p>
                  <p className="text-xl sm:text-2xl font-bold text-white">{selectedUser.statistics.connections_count}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3 sm:p-4">
                  <p className="text-white/60 text-xs sm:text-sm mb-1">Goals</p>
                  <p className="text-xl sm:text-2xl font-bold text-white">{selectedUser.statistics.goals_count}</p>
                  <p className="text-xs text-white/60 mt-1">{selectedUser.statistics.active_goals_count} active</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3 sm:p-4">
                  <p className="text-white/60 text-xs sm:text-sm mb-1">Transactions</p>
                  <p className="text-xl sm:text-2xl font-bold text-white">{selectedUser.statistics.transactions_count}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3 sm:p-4">
                  <p className="text-white/60 text-xs sm:text-sm mb-1">Goals Progress</p>
                  <p className="text-xl sm:text-2xl font-bold text-white">{selectedUser.statistics.goals_progress_percent.toFixed(1)}%</p>
                  <p className="text-xs text-white/60 mt-1 break-words">₹{selectedUser.statistics.total_goals_saved.toLocaleString()} / ₹{selectedUser.statistics.total_goals_target.toLocaleString()}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Connections</h3>
                  <div className="space-y-2">
                    {selectedUser.connections.length === 0 ? (
                      <p className="text-white/60">No connections</p>
                    ) : (
                      selectedUser.connections.map((conn: any) => (
                        <div key={conn.id} className="bg-white/5 rounded-lg p-3">
                          <p className="text-white font-medium">{conn.name}</p>
                          <p className="text-sm text-white/60">{conn.type} • {conn.status}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Recent Goals</h3>
                  <div className="space-y-2">
                    {selectedUser.goals.length === 0 ? (
                      <p className="text-white/60">No goals</p>
                    ) : (
                      selectedUser.goals.slice(0, 5).map((goal: any) => (
                        <div key={goal.id} className="bg-white/5 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-white font-medium">{goal.name}</p>
                            <span className={`px-2 py-1 text-xs rounded-md ${goal.is_completed ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                              {goal.is_completed ? 'Completed' : 'Active'}
                            </span>
                          </div>
                          <p className="text-sm text-white/60">₹{goal.saved.toLocaleString()} / ₹{goal.target.toLocaleString()}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/5 border-b border-violet-500/20">
                    <tr>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">Email</th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">Name</th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">Status</th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">Stats</th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">Created</th>
                      <th className="px-4 lg:px-6 py-3 text-right text-xs font-medium text-white/60 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-violet-500/10">
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-white/60">
                          No users found
                        </td>
                      </tr>
                    ) : (
                      users.map((user) => (
                        <tr key={user.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-white">{user.email}</td>
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-white/80">
                            {user.first_name || user.last_name ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'N/A'}
                          </td>
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-2">
                              <span className={`px-2 py-1 text-xs font-medium rounded-md ${user.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                {user.is_active ? 'Active' : 'Inactive'}
                              </span>
                              {!user.is_verified && (
                                <span className="px-2 py-1 text-xs font-medium rounded-md bg-yellow-500/20 text-yellow-400">
                                  Unverified
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-white/60">
                            {user.stats && (
                              <div className="flex items-center space-x-3">
                                <span title="Connections">{user.stats.connections}</span>
                                <span>•</span>
                                <span title="Goals">{user.stats.goals}</span>
                                <span>•</span>
                                <span title="Transactions">{user.stats.transactions}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-white/60">
                            {formatDate(user.created_at)}
                          </td>
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => loadUserDetails(user.id)}
                                className="p-2 text-violet-400 hover:text-violet-300 hover:bg-white/5 rounded-lg transition-all"
                                title="View Details"
                              >
                                <EyeIcon className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleEditUser(user)}
                                className="p-2 text-violet-400 hover:text-violet-300 hover:bg-white/5 rounded-lg transition-all"
                                title="Edit"
                              >
                                <PencilIcon className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user.id, user.email)}
                                className="p-2 text-red-400 hover:text-red-300 hover:bg-white/5 rounded-lg transition-all"
                                title="Delete"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {users.length === 0 ? (
                <div className="bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl p-6 text-center text-white/60">
                  No users found
                </div>
              ) : (
                users.map((user) => (
                  <div key={user.id} className="bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-white mb-1 truncate">
                          {user.first_name || user.last_name ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'N/A'}
                        </h3>
                        <p className="text-xs text-white/60 truncate">{user.email}</p>
                      </div>
                      <div className="flex items-center space-x-1 ml-2">
                        <button
                          onClick={() => loadUserDetails(user.id)}
                          className="p-1.5 text-violet-400 hover:text-violet-300 hover:bg-white/5 rounded-lg transition-all"
                          title="View Details"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleEditUser(user)}
                          className="p-1.5 text-violet-400 hover:text-violet-300 hover:bg-white/5 rounded-lg transition-all"
                          title="Edit"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id, user.email)}
                          className="p-1.5 text-red-400 hover:text-red-300 hover:bg-white/5 rounded-lg transition-all"
                          title="Delete"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-md ${user.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                      {!user.is_verified && (
                        <span className="px-2 py-1 text-xs font-medium rounded-md bg-yellow-500/20 text-yellow-400">
                          Unverified
                        </span>
                      )}
                    </div>
                    {user.stats && (
                      <div className="text-xs text-white/60 mb-2">
                        <span title="Connections">Conn: {user.stats.connections}</span>
                        <span className="mx-2">•</span>
                        <span title="Goals">Goals: {user.stats.goals}</span>
                        <span className="mx-2">•</span>
                        <span title="Transactions">Trans: {user.stats.transactions}</span>
                      </div>
                    )}
                    <div className="text-xs text-white/60">
                      Created: {formatDate(user.created_at)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Transaction Management Section */}
      <div>
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Transaction Management</h1>
          <p className="text-sm sm:text-base text-white/60">Manage mock transaction data for testing</p>
        </div>

        {!selectedFile ? (
          <>
            {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
              <p className="mt-4 text-white/60">Loading files...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {files.map((file) => (
                <button
                  key={file.filename}
                  onClick={() => setSelectedFile(file.filename)}
                  className="p-6 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl hover:border-violet-500/40 hover:bg-white/10 transition-all text-left group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <DocumentTextIcon className="h-8 w-8 text-violet-400 group-hover:text-violet-300 transition-colors" />
                    <span className="px-2 py-1 text-xs font-medium bg-violet-500/20 text-violet-300 rounded-md">
                      {file.type}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{file.filename}</h3>
                  <p className="text-sm text-white/60">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </button>
              ))}
            </div>
          )}
          </>
        ) : (
          <>
            <div className="mb-6">
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setFileData(null);
                  resetForm();
                }}
                className="flex items-center space-x-2 text-white/60 hover:text-white transition-colors mb-4"
              >
                <ArrowLeftIcon className="h-5 w-5" />
                <span>Back to Files</span>
              </button>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-2 break-words">{selectedFile}</h1>
              <p className="text-sm sm:text-base text-white/60">
                {transactions.length} {isCashIncome ? 'entries' : 'transactions'}
              </p>
            </div>
            <button
              onClick={() => {
                resetForm();
                setShowAddForm(true);
              }}
              className="flex items-center justify-center space-x-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl hover:from-violet-500 hover:to-purple-500 transition-all shadow-lg shadow-violet-500/20 text-sm sm:text-base"
            >
              <PlusIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              <span>Add {isCashIncome ? 'Entry' : 'Transaction'}</span>
            </button>
          </div>
        </div>

        {showAddForm && (
          <div className="mb-6 p-4 sm:p-6 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl">
            <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">
              {editingTransaction ? 'Edit' : 'Add'} {isCashIncome ? 'Entry' : 'Transaction'}
            </h2>
            <form onSubmit={editingTransaction ? handleUpdateTransaction : handleAddTransaction}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-violet-500/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    {isCashIncome ? 'Type' : 'Transaction Type'}
                  </label>
                  {isCashIncome ? (
                    <input
                      type="text"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-4 py-2 bg-white/5 border border-violet-500/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      placeholder="Income"
                    />
                  ) : (
                    <select
                      required
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-800/90 border border-violet-500/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      style={{ colorScheme: 'dark' }}
                    >
                      <option value="credit" style={{ backgroundColor: '#1e293b', color: '#ffffff' }}>Credit</option>
                      <option value="debit" style={{ backgroundColor: '#1e293b', color: '#ffffff' }}>Debit</option>
                    </select>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-white/80 mb-2">Description</label>
                  <input
                    type="text"
                    required
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-violet-500/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                </div>
                {isCashIncome ? (
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Date</label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full px-4 py-2 bg-white/5 border border-violet-500/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Timestamp</label>
                    <input
                      type="datetime-local"
                      value={formData.timestamp ? formData.timestamp.slice(0, 16) : ''}
                      onChange={(e) => setFormData({ ...formData, timestamp: new Date(e.target.value).toISOString() })}
                      className="w-full px-4 py-2 bg-white/5 border border-violet-500/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                    />
                  </div>
                )}
                {!isCashIncome && (
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-800/90 border border-violet-500/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      style={{ colorScheme: 'dark' }}
                    >
                      <option value="completed" style={{ backgroundColor: '#1e293b', color: '#ffffff' }}>Completed</option>
                      <option value="pending" style={{ backgroundColor: '#1e293b', color: '#ffffff' }}>Pending</option>
                      <option value="failed" style={{ backgroundColor: '#1e293b', color: '#ffffff' }}>Failed</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-3">
                <button
                  type="submit"
                  className="px-6 py-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg hover:from-violet-500 hover:to-purple-500 transition-all"
                >
                  {editingTransaction ? 'Update' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    resetForm();
                  }}
                  className="px-6 py-2 bg-white/5 border border-violet-500/20 text-white rounded-lg hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
            <p className="mt-4 text-white/60">Loading transactions...</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/5 border-b border-violet-500/20">
                    <tr>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                        ID
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                        {isCashIncome ? 'Date' : 'Timestamp'}
                      </th>
                      {!isCashIncome && (
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                          Status
                        </th>
                      )}
                      <th className="px-4 lg:px-6 py-3 text-right text-xs font-medium text-white/60 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-violet-500/10">
                    {transactions.length === 0 ? (
                      <tr>
                        <td colSpan={isCashIncome ? 6 : 7} className="px-6 py-8 text-center text-white/60">
                          No transactions found
                        </td>
                      </tr>
                    ) : (
                      transactions.map((transaction) => (
                        <tr key={transaction.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-white/80 font-mono">
                            {transaction.id}
                          </td>
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-white font-semibold">
                            ₹{transaction.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 text-xs font-medium rounded-md ${
                                (isCashIncome ? transaction.category : transaction.type) === 'credit' ||
                                transaction.category === 'Income'
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}
                            >
                              {isCashIncome ? transaction.category : transaction.type}
                            </span>
                          </td>
                          <td className="px-4 lg:px-6 py-4 text-sm text-white/80">
                            {transaction.description}
                          </td>
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-white/60">
                            {formatDate(transaction.date || transaction.timestamp)}
                          </td>
                          {!isCashIncome && (
                            <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-1 text-xs font-medium rounded-md ${
                                  transaction.status === 'completed'
                                    ? 'bg-green-500/20 text-green-400'
                                    : transaction.status === 'pending'
                                    ? 'bg-yellow-500/20 text-yellow-400'
                                    : 'bg-red-500/20 text-red-400'
                                }`}
                              >
                                {transaction.status}
                              </span>
                            </td>
                          )}
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => handleEdit(transaction)}
                                className="p-2 text-violet-400 hover:text-violet-300 hover:bg-white/5 rounded-lg transition-all"
                                title="Edit"
                              >
                                <PencilIcon className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteTransaction(transaction.id)}
                                className="p-2 text-red-400 hover:text-red-300 hover:bg-white/5 rounded-lg transition-all"
                                title="Delete"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {transactions.length === 0 ? (
                <div className="bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl p-6 text-center text-white/60">
                  No transactions found
                </div>
              ) : (
                transactions.map((transaction) => (
                  <div key={transaction.id} className="bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg sm:text-xl font-bold text-white">
                            ₹{transaction.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded-md ${
                              (isCashIncome ? transaction.category : transaction.type) === 'credit' ||
                              transaction.category === 'Income'
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {isCashIncome ? transaction.category : transaction.type}
                          </span>
                          {!isCashIncome && (
                            <span
                              className={`px-2 py-1 text-xs font-medium rounded-md ${
                                transaction.status === 'completed'
                                  ? 'bg-green-500/20 text-green-400'
                                  : transaction.status === 'pending'
                                  ? 'bg-yellow-500/20 text-yellow-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}
                            >
                              {transaction.status}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-white/90 mb-2 break-words">{transaction.description}</p>
                        <p className="text-xs text-white/60 mb-1">
                          {formatDate(transaction.date || transaction.timestamp)}
                        </p>
                        <p className="text-xs text-white/40 font-mono">ID: {transaction.id}</p>
                      </div>
                      <div className="flex items-center space-x-1 ml-2">
                        <button
                          onClick={() => handleEdit(transaction)}
                          className="p-1.5 text-violet-400 hover:text-violet-300 hover:bg-white/5 rounded-lg transition-all"
                          title="Edit"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTransaction(transaction.id)}
                          className="p-1.5 text-red-400 hover:text-red-300 hover:bg-white/5 rounded-lg transition-all"
                          title="Delete"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
          </>
        )}
      </div>

      {/* Edit User Form Modal */}
      {showUserEditForm && editingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-violet-500/20 rounded-xl p-4 sm:p-6 max-w-md w-full my-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-semibold text-white">Edit User</h2>
              <button
                onClick={() => {
                  setShowUserEditForm(false);
                  setEditingUser(null);
                }}
                className="text-white/60 hover:text-white"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <form onSubmit={handleUpdateUser}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">First Name</label>
                  <input
                    type="text"
                    value={userFormData.first_name}
                    onChange={(e) => setUserFormData({ ...userFormData, first_name: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-violet-500/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Last Name</label>
                  <input
                    type="text"
                    value={userFormData.last_name}
                    onChange={(e) => setUserFormData({ ...userFormData, last_name: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-violet-500/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Monthly Budget</label>
                  <input
                    type="number"
                    step="0.01"
                    value={userFormData.monthly_budget}
                    onChange={(e) => setUserFormData({ ...userFormData, monthly_budget: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-violet-500/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Language</label>
                  <select
                    value={userFormData.language_preference}
                    onChange={(e) => setUserFormData({ ...userFormData, language_preference: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-800/90 border border-violet-500/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                    style={{ colorScheme: 'dark' }}
                  >
                    <option value="en" style={{ backgroundColor: '#1e293b', color: '#ffffff' }}>English</option>
                    <option value="hi" style={{ backgroundColor: '#1e293b', color: '#ffffff' }}>Hindi</option>
                    <option value="ta" style={{ backgroundColor: '#1e293b', color: '#ffffff' }}>Tamil</option>
                    <option value="te" style={{ backgroundColor: '#1e293b', color: '#ffffff' }}>Telugu</option>
                  </select>
                </div>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={userFormData.is_active}
                      onChange={(e) => setUserFormData({ ...userFormData, is_active: e.target.checked })}
                      className="w-4 h-4 text-violet-600 rounded focus:ring-violet-500"
                    />
                    <span className="text-sm text-white/80">Active</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={userFormData.is_verified}
                      onChange={(e) => setUserFormData({ ...userFormData, is_verified: e.target.checked })}
                      className="w-4 h-4 text-violet-600 rounded focus:ring-violet-500"
                    />
                    <span className="text-sm text-white/80">Verified</span>
                  </label>
                </div>
              </div>
              <div className="flex items-center space-x-3 mt-6">
                <button
                  type="submit"
                  className="flex-1 px-6 py-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg hover:from-violet-500 hover:to-purple-500 transition-all"
                >
                  Update
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowUserEditForm(false);
                    setEditingUser(null);
                  }}
                  className="px-6 py-2 bg-white/5 border border-violet-500/20 text-white rounded-lg hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Form Modal */}
      {showPasswordResetForm && editingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-violet-500/20 rounded-xl p-4 sm:p-6 max-w-md w-full my-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-semibold text-white">Reset Password</h2>
              <button
                onClick={() => {
                  setShowPasswordResetForm(false);
                  setEditingUser(null);
                  setNewPassword('');
                }}
                className="text-white/60 hover:text-white"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <form onSubmit={handleResetPassword}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-white/80 mb-2">New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-violet-500/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  placeholder="Enter new password"
                />
              </div>
              <div className="flex items-center space-x-3">
                <button
                  type="submit"
                  className="flex-1 px-6 py-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg hover:from-violet-500 hover:to-purple-500 transition-all"
                >
                  Reset Password
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordResetForm(false);
                    setEditingUser(null);
                    setNewPassword('');
                  }}
                  className="px-6 py-2 bg-white/5 border border-violet-500/20 text-white rounded-lg hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <AlertModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, type: null, id: null })}
        title={deleteModal.type === 'user' ? 'Delete User' : 'Delete Transaction'}
        message={
          deleteModal.type === 'user'
            ? `Are you sure you want to delete user ${deleteModal.name}? This action cannot be undone.`
            : 'Are you sure you want to delete this transaction? This action cannot be undone.'
        }
        type="warning"
        confirmText="Delete"
        onConfirm={
          deleteModal.type === 'user' ? confirmDeleteUser : confirmDeleteTransaction
        }
        showCancel={true}
        cancelText="Cancel"
      />
    </div>
  );
};

export default AdminPanelPage;

