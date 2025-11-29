import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { authAPI } from '../services/api';
import AlertModal from '../components/AlertModal';
import {
  UserCircleIcon,
  CreditCardIcon,
  ShieldCheckIcon,
  TrashIcon,
  XMarkIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

const SettingsPage: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Profile state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  
  // Change Password modal state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [changingPassword, setChangingPassword] = useState(false);
  
  // Delete Account modal state
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  
  // Alert modal state
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
  });
  
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  
  // Load user preferences on mount
  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
    }
  }, [user]);

  const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  // Part 1: Save Profile
  const handleSaveProfile = async () => {
    try {
      setLoading(true);
      setSaveSuccess(false);
      await authAPI.updateUser({
        first_name: firstName,
        last_name: lastName,
      });
      
      // Refresh user data
      const updatedUser = await authAPI.getCurrentUser();
      // Update auth context by reloading
      window.location.reload();
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error saving profile:', err);
      setAlertModal({
        isOpen: true,
        title: t('common.error'),
        message: err.response?.data?.detail || err.message || t('settings.failedToSaveProfile'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  // Part 2: Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setAlertModal({
        isOpen: true,
        title: t('common.error'),
        message: t('settings.passwordsDoNotMatch'),
        type: 'error',
      });
      return;
    }
    
    if (passwordForm.newPassword.length < 6) {
      setAlertModal({
        isOpen: true,
        title: t('common.error'),
        message: t('settings.passwordMinLength'),
        type: 'error',
      });
      return;
    }
    
    try {
      setChangingPassword(true);
      await authAPI.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setShowChangePassword(false);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setAlertModal({
        isOpen: true,
        title: t('common.success'),
        message: t('settings.passwordChangedSuccess'),
        type: 'success',
      });
    } catch (err: any) {
      console.error('Error changing password:', err);
      setAlertModal({
        isOpen: true,
        title: t('common.error'),
        message: err.response?.data?.detail || err.message || t('settings.failedToChangePassword'),
        type: 'error',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  // Part 3: Export Data
  const handleExportData = async () => {
    try {
      // This would typically fetch all user data and create a downloadable file
      // For now, we'll show a message
      setAlertModal({
        isOpen: true,
        title: 'Info',
        message: t('settings.exportDataComingSoon'),
        type: 'info',
      });
    } catch (err: any) {
      console.error('Error exporting data:', err);
      setAlertModal({
        isOpen: true,
        title: t('common.error'),
        message: t('settings.failedToExportData'),
        type: 'error',
      });
    }
  };

  // Part 4: Delete Account
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      setAlertModal({
        isOpen: true,
        title: t('common.error'),
        message: t('settings.typeDeleteToConfirm'),
        type: 'error',
      });
      return;
    }
    
    setConfirmModal({
      isOpen: true,
      title: t('settings.deleteAccount'),
      message: t('settings.deleteAccountConfirm'),
      onConfirm: async () => {
        try {
          setDeletingAccount(true);
          await authAPI.deleteAccount();
          setAlertModal({
            isOpen: true,
            title: t('common.success'),
            message: t('settings.accountDeletedSuccess'),
            type: 'success',
            onConfirm: () => {
              // Logout and redirect to login
              localStorage.removeItem('token');
              localStorage.removeItem('agent_playground_state');
              window.location.href = '/login';
            },
          });
        } catch (err: any) {
          console.error('Error deleting account:', err);
          setAlertModal({
            isOpen: true,
            title: t('common.error'),
            message: err.response?.data?.detail || err.message || t('settings.failedToDeleteAccount'),
            type: 'error',
          });
        } finally {
          setDeletingAccount(false);
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">{t('settings.title')}</h1>
        <p className="text-white/70">{t('settings.subtitle')}</p>
      </div>

      {/* Profile Settings */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
      >
        <div className="flex items-center space-x-3 mb-6">
          <UserCircleIcon className="h-6 w-6 text-violet-400" />
          <h2 className="text-xl font-bold text-white">{t('settings.profile')}</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">{t('settings.firstName')}</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full px-4 py-2 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
              placeholder={t('settings.enterFirstName')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">{t('settings.lastName')}</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full px-4 py-2 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
              placeholder={t('settings.enterLastName')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">{t('settings.email')}</label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full px-4 py-2 bg-white/5 border border-violet-500/10 rounded-xl text-white/60 cursor-not-allowed"
            />
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleSaveProfile}
              disabled={loading}
              className="px-4 py-2 bg-gradient-to-r from-violet-600/90 to-purple-600/90 text-white rounded-xl hover:shadow-lg hover:shadow-violet-500/30 backdrop-blur-sm border border-violet-400/30 transition-all disabled:opacity-50"
            >
              {loading ? t('settings.saving') : t('settings.saveChanges')}
            </button>
            {saveSuccess && (
              <div className="flex items-center space-x-2 text-green-400">
                <CheckCircleIcon className="h-5 w-5" />
                <span className="text-sm">{t('settings.saved')}</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Subscription */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
      >
        <div className="flex items-center space-x-3 mb-6">
          <CreditCardIcon className="h-6 w-6 text-violet-400" />
          <h2 className="text-xl font-bold text-white">{t('settings.subscription')}</h2>
        </div>
        <div className="p-4 bg-gradient-to-r from-violet-600/20 to-purple-600/20 backdrop-blur-xl rounded-lg border border-violet-500/30">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-lg font-bold text-white">
                {user?.subscription_status === 'premium' ? t('settings.premiumPlan') : t('settings.freePlan')}
              </p>
              <p className="text-sm text-white/60">
                {user?.subscription_status === 'premium'
                  ? t('settings.premiumAccess')
                  : t('settings.upgradeToPremium')}
              </p>
            </div>
            {user?.subscription_status !== 'premium' && (
              <button className="px-4 py-2 bg-gradient-to-r from-violet-600/90 to-purple-600/90 text-white rounded-xl hover:shadow-lg hover:shadow-violet-500/30 backdrop-blur-sm border border-violet-400/30 transition-all">
                {t('settings.upgradeToPremium')}
              </button>
            )}
          </div>
          {user?.subscription_status !== 'premium' && (
            <div className="pt-4 border-t border-violet-500/20">
              <p className="text-sm text-white/80 mb-2">{t('settings.premiumFeaturesInclude')}</p>
              <ul className="text-sm text-white/60 space-y-1">
                <li>• {t('settings.premiumFeature1')}</li>
                <li>• {t('settings.premiumFeature2')}</li>
                <li>• {t('settings.premiumFeature3')}</li>
                <li>• {t('settings.premiumFeature4')}</li>
              </ul>
            </div>
          )}
        </div>
      </motion.div>

      {/* Privacy & Security */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
      >
        <div className="flex items-center space-x-3 mb-6">
          <ShieldCheckIcon className="h-6 w-6 text-violet-400" />
          <h2 className="text-xl font-bold text-white">{t('settings.privacy')}</h2>
        </div>
        <div className="space-y-4">
          <button
            onClick={() => setShowChangePassword(true)}
            className="w-full text-left px-4 py-3 bg-white/5 backdrop-blur-sm hover:bg-white/10 rounded-lg border border-transparent hover:border-violet-500/20 transition-all"
          >
            <p className="text-white font-medium">{t('settings.changePassword')}</p>
            <p className="text-sm text-white/60">{t('settings.updatePassword')}</p>
          </button>
          <button
            onClick={handleExportData}
            className="w-full text-left px-4 py-3 bg-white/5 backdrop-blur-sm hover:bg-white/10 rounded-lg border border-transparent hover:border-violet-500/20 transition-all"
          >
            <p className="text-white font-medium">{t('settings.exportData')}</p>
            <p className="text-sm text-white/60">{t('settings.downloadData')}</p>
          </button>
          <button
            onClick={() => window.open('https://example.com/privacy-policy', '_blank')}
            className="w-full text-left px-4 py-3 bg-white/5 backdrop-blur-sm hover:bg-white/10 rounded-lg border border-transparent hover:border-violet-500/20 transition-all"
          >
            <p className="text-white font-medium">{t('settings.privacyPolicy')}</p>
            <p className="text-sm text-white/60">{t('settings.readPrivacyPolicy')}</p>
          </button>
        </div>
      </motion.div>

      {/* Danger Zone */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-red-500/10 backdrop-blur-2xl rounded-xl p-6 border border-red-500/30 shadow-xl"
      >
        <div className="flex items-center space-x-3 mb-6">
          <TrashIcon className="h-6 w-6 text-red-400" />
          <h2 className="text-xl font-bold text-white">{t('settings.dangerZone')}</h2>
        </div>
        <div className="space-y-4">
          <button
            onClick={() => setShowDeleteAccount(true)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            {t('settings.deleteAccount')}
          </button>
          <p className="text-sm text-white/60">
            {t('settings.deleteAccountWarning')}
          </p>
        </div>
      </motion.div>

      {/* Change Password Modal */}
      <AnimatePresence>
        {showChangePassword && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowChangePassword(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900/95 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-white">{t('settings.changePassword')}</h2>
                <button
                  onClick={() => {
                    setShowChangePassword(false);
                    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                  }}
                  className="text-white/70 hover:text-white"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">{t('settings.currentPassword')}</label>
                  <input
                    type="password"
                    required
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-violet-500/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-violet-400/50"
                    placeholder={t('settings.enterCurrentPassword')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">{t('settings.newPassword')}</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-violet-500/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-violet-400/50"
                    placeholder={t('settings.enterNewPassword')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">{t('settings.confirmNewPassword')}</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-violet-500/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-violet-400/50"
                    placeholder={t('settings.confirmNewPassword')}
                  />
                </div>
                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowChangePassword(false);
                      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                    }}
                    className="flex-1 px-4 py-2 bg-white/5 border border-violet-500/20 text-white rounded-lg hover:bg-white/10 transition-all"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={changingPassword}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-violet-600/90 to-purple-600/90 text-white rounded-lg hover:shadow-lg hover:shadow-violet-500/30 transition-all disabled:opacity-50"
                  >
                    {changingPassword ? t('settings.changing') : t('settings.changePassword')}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Account Modal */}
      <AnimatePresence>
        {showDeleteAccount && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowDeleteAccount(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900/95 backdrop-blur-2xl rounded-xl p-6 border border-red-500/30 shadow-xl w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-white">{t('settings.deleteAccount')}</h2>
                <button
                  onClick={() => {
                    setShowDeleteAccount(false);
                    setDeleteConfirmText('');
                  }}
                  className="text-white/70 hover:text-white"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-red-300 font-semibold mb-2">{t('settings.warningCannotUndo')}</p>
                  <p className="text-sm text-white/70">
                    {t('settings.deletingAccountWillRemove')}
                  </p>
                  <ul className="text-sm text-white/60 mt-2 space-y-1 list-disc list-inside">
                    <li>{t('settings.deleteItem1')}</li>
                    <li>{t('settings.deleteItem2')}</li>
                    <li>{t('settings.deleteItem3')}</li>
                    <li>{t('settings.deleteItem4')}</li>
                    <li>{t('settings.deleteItem5')}</li>
                  </ul>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    {t('settings.typeDeleteToConfirm')}
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className="w-full px-4 py-2 bg-white/5 border border-red-500/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-red-400/50"
                    placeholder={t('settings.typeDeleteToConfirm')}
                  />
                </div>
                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteAccount(false);
                      setDeleteConfirmText('');
                    }}
                    className="flex-1 px-4 py-2 bg-white/5 border border-violet-500/20 text-white rounded-lg hover:bg-white/10 transition-all"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={deletingAccount || deleteConfirmText !== 'DELETE'}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingAccount ? t('settings.deleting') : t('settings.deleteAccount')}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Alert Modal */}
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onConfirm={alertModal.onConfirm}
      />

      {/* Confirm Modal */}
      <AlertModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        title={confirmModal.title}
        message={confirmModal.message}
        type="warning"
        confirmText={t('common.confirm')}
        onConfirm={confirmModal.onConfirm}
        showCancel={true}
        cancelText={t('common.cancel')}
      />
    </div>
  );
};

export default SettingsPage;

