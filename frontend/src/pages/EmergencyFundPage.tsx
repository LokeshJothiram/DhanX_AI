import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon,
  CalendarIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useData } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import AlertModal from '../components/AlertModal';
import { goalsAPI } from '../services/api';

interface EmergencyFundData {
  current: number;
  target: number;
  progress: number;
  monthsCovered: number;
  recommendedMonths: number;
}

interface DryPeriodPrediction {
  period: string;
  severity: 'low' | 'medium' | 'high';
  predictedIncome: number;
  averageIncome: number;
  recommendation: string;
}

interface SavingsHistoryItem {
  month: string;
  amount: number;
}

const EmergencyFundPage: React.FC = () => {
  const { t } = useLanguage();
  
  // Use pre-loaded data from DataContext
  const { spendingTransactions: sharedSpending, transactionsLoading, refreshTransactions, goals: sharedGoals, goalsLoading, refreshGoals } = useData();
  
  const [emergencyFund, setEmergencyFund] = useState<EmergencyFundData>({
    current: 0,
    target: 0,
    progress: 0,
    monthsCovered: 0,
    recommendedMonths: 6,
  });
  const [dryPeriodPredictions, setDryPeriodPredictions] = useState<DryPeriodPrediction[]>([]);
  const [savingsHistory, setSavingsHistory] = useState<SavingsHistoryItem[]>([]);
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [addFundsAmount, setAddFundsAmount] = useState('');
  const [addingFunds, setAddingFunds] = useState(false);
  const [emergencyGoalId, setEmergencyGoalId] = useState<string | null>(null);
  
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

  useEffect(() => {
    // Use pre-loaded data - no need to fetch separately
    if (!transactionsLoading && !goalsLoading && sharedGoals.length >= 0) {
      loadEmergencyFundData();
    }
  }, [sharedSpending, sharedGoals, transactionsLoading, goalsLoading]);


  const loadEmergencyFundData = async () => {
    try {
      
      // Use pre-loaded goals from context - no need to fetch
      const goals = sharedGoals;

      // Get emergency fund goals
      const emergencyGoals = goals.filter((g: any) => g.type === 'emergency' && !g.is_completed);
      const current = emergencyGoals.reduce((sum: number, goal: any) => sum + Number(goal.saved || 0), 0);
      const target = emergencyGoals.reduce((sum: number, goal: any) => sum + Number(goal.target || 0), 0);
      const progress = target > 0 ? Math.round((current / target) * 100) : 0;
      
      // Set the first emergency goal ID for adding funds (or create one if none exists)
      if (emergencyGoals.length > 0) {
        setEmergencyGoalId(emergencyGoals[0].id);
      } else {
        setEmergencyGoalId(null);
      }

      // Use shared spending transactions instead of fetching
      const allTransactions: any[] = sharedSpending.map((txn) => ({
        amount: txn.amount,
        date: new Date(txn.date),
      }));

      // Calculate average monthly expenses (last 3 months)
      const now = new Date();
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      const recentExpenses = allTransactions.filter(
        (txn) => new Date(txn.date) >= threeMonthsAgo
      );
      
      const monthlyExpenses = recentExpenses.reduce((sum, txn) => sum + txn.amount, 0) / 3;
      const averageMonthlyExpenses = monthlyExpenses > 0 ? monthlyExpenses : 5000; // Default fallback
      
      // Calculate months covered
      const monthsCovered = averageMonthlyExpenses > 0 ? current / averageMonthlyExpenses : 0;

      // Update emergency fund data
      setEmergencyFund({
        current,
        target: target > 0 ? target : 50000, // Default target if no goals
        progress,
        monthsCovered: Math.round(monthsCovered * 10) / 10, // Round to 1 decimal
        recommendedMonths: 6,
      });

      // Calculate savings history from goals (last 6 months)
      const history: SavingsHistoryItem[] = [];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = `${months[date.getMonth()]} ${date.getFullYear()}`;
        
        // Calculate savings for this month from goal creation/updates
        // For now, we'll estimate based on goal progress
        // In a real scenario, you'd track goal updates over time
        const monthSavings = i === 0 ? current / 6 : 0; // Simplified calculation
        history.push({
          month: monthKey,
          amount: Math.round(monthSavings),
        });
      }
      
      // Filter out zero amounts and show only last 4 months with data
      const filteredHistory = history.filter(h => h.amount > 0).slice(-4);
      setSavingsHistory(filteredHistory.length > 0 ? filteredHistory : [
        { month: months[now.getMonth()] + ' ' + now.getFullYear(), amount: Math.round(current / 6) }
      ]);

      // Generate initial dry period predictions
      updateDryPeriodPredictions(averageMonthlyExpenses);
    } catch (err) {
      console.error('Error loading emergency fund data:', err);
    }
  };

  const updateDryPeriodPredictions = (averageMonthlyExpenses: number = 5000) => {
    const predictions: DryPeriodPrediction[] = [];
    const now = new Date();
    
    // Fallback: simple predictions
    const avgIncome = averageMonthlyExpenses * 1.5;
    predictions.push({
      period: 'Next 7 days',
      severity: 'low',
      predictedIncome: Math.round(avgIncome * 0.25),
      averageIncome: Math.round(avgIncome * 0.25),
      recommendation: 'Continue building your emergency fund',
    });
    
    setDryPeriodPredictions(predictions);
  };

  const formatDateRange = (start: Date, end: Date): string => {
    const format = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    return `${format(start)} to ${format(end)}`;
  };

  const handleAddFunds = async () => {
    if (!addFundsAmount || parseFloat(addFundsAmount) <= 0) {
      setAlertModal({
        isOpen: true,
        title: t('common.error'),
        message: t('emergencyFund.enterAmount'),
        type: 'error',
      });
      return;
    }

    const amountToAdd = parseFloat(addFundsAmount);

    if (!emergencyGoalId) {
      // Create a new emergency fund goal if none exists
      try {
        setAddingFunds(true);
        const newGoal = await goalsAPI.createGoal({
          name: 'Emergency Fund',
          target: 100000, // Default target
          type: 'emergency',
          saved: amountToAdd,
        });
        
        // Optimistically update UI immediately
        setEmergencyGoalId(newGoal.id);
        setShowAddFunds(false);
        setAddFundsAmount('');
        setAddingFunds(false); // Hide loading immediately
        
        // Refresh data in background (don't wait for it)
        refreshGoals().catch(err => console.error('Background refresh failed:', err));
        loadEmergencyFundData().catch(err => console.error('Background data reload failed:', err));
      } catch (err: any) {
        setAddingFunds(false);
        const errorMessage = err.response?.data?.detail || err.message || 'Failed to create emergency fund';
        console.error('Error creating emergency fund goal:', err);
        // Only show error if it's a real error, not a timeout
        if (!err.code || err.code !== 'ECONNABORTED') {
          setAlertModal({
            isOpen: true,
            title: t('common.error'),
            message: t('emergencyFund.failedToCreate'),
            type: 'error',
          });
        } else {
          // For timeout, refresh in background and show success
          setShowAddFunds(false);
          setAddFundsAmount('');
          refreshGoals().catch(() => {});
        }
      }
      return;
    }

    try {
      setAddingFunds(true);
      // Get current goal from shared goals
      const emergencyGoal = sharedGoals.find((g: any) => g.id === emergencyGoalId && g.type === 'emergency');
      
      if (emergencyGoal) {
        const newSavedAmount = Number(emergencyGoal.saved) + amountToAdd;
        await goalsAPI.updateGoal(emergencyGoalId, {
          saved: newSavedAmount,
        });
        
        // Optimistically update UI immediately
        setShowAddFunds(false);
        setAddFundsAmount('');
        setAddingFunds(false); // Hide loading immediately
        
        // Refresh data in background (don't wait for it)
        refreshGoals().catch(err => console.error('Background refresh failed:', err));
        loadEmergencyFundData().catch(err => console.error('Background data reload failed:', err));
      } else {
        setAddingFunds(false);
        setAlertModal({
          isOpen: true,
          title: t('common.error'),
          message: t('emergencyFund.emergencyFundNotFound'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setAddingFunds(false);
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to add funds';
      console.error('Error adding funds to emergency fund:', err);
      // Only show error if it's a real error, not a timeout
      if (!err.code || err.code !== 'ECONNABORTED') {
        setAlertModal({
          isOpen: true,
          title: t('common.error'),
          message: t('emergencyFund.failedToAdd'),
          type: 'error',
        });
      } else {
        // For timeout, refresh in background and show success
        setShowAddFunds(false);
        setAddFundsAmount('');
        refreshGoals().catch(() => {});
      }
    }
  };

  const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">{t('emergencyFund.title')}</h1>
          <p className="text-white/70">{t('emergencyFund.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowAddFunds(true)}
          className="mt-4 sm:mt-0 flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-600/90 to-cyan-600/90 text-white rounded-xl hover:shadow-lg hover:shadow-blue-500/30 backdrop-blur-sm border border-blue-400/30 transition-all"
        >
          <PlusIcon className="h-5 w-5" />
          <span>{t('emergencyFund.addFunds')}</span>
        </button>
      </div>

      {/* Emergency Fund Status */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
      >
        {transactionsLoading || goalsLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-white/10 rounded"></div>
            <div className="h-4 bg-white/10 rounded"></div>
            <div className="h-4 bg-white/10 rounded"></div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 backdrop-blur-sm border border-white/10">
                  <ShieldCheckIcon className="h-8 w-8 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{t('emergencyFund.title')}</h2>
                  <p className="text-sm text-white/60">
                    {emergencyFund.monthsCovered > 0 
                      ? `${emergencyFund.monthsCovered} ${t('emergencyFund.monthsCovered')}`
                      : t('emergencyFund.createEmergencyFund')}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-white">₹{emergencyFund.current.toLocaleString('en-IN')}</p>
                <p className="text-sm text-white/60">of ₹{emergencyFund.target.toLocaleString('en-IN')}</p>
              </div>
            </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-white/60">{t('goals.progress')}</span>
            <span className="text-sm font-semibold text-white">{emergencyFund.progress}%</span>
          </div>
          <div className="h-4 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full"
              style={{ width: `${emergencyFund.progress}%` }}
            />
          </div>
        </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-violet-500/20">
              <div>
                <p className="text-xs text-white/60 mb-1">{t('emergencyFund.currentSavings')}</p>
                <p className="text-lg font-bold text-white">₹{emergencyFund.current.toLocaleString('en-IN')}</p>
              </div>
              <div>
                <p className="text-xs text-white/60 mb-1">{t('emergencyFund.targetAmount')}</p>
                <p className="text-lg font-bold text-white">₹{emergencyFund.target.toLocaleString('en-IN')}</p>
              </div>
              <div>
                <p className="text-xs text-white/60 mb-1">{t('spending.remaining')}</p>
                <p className="text-lg font-bold text-green-400">
                  ₹{Math.max(0, emergencyFund.target - emergencyFund.current).toLocaleString('en-IN')}
                </p>
              </div>
            </div>
          </>
        )}
      </motion.div>

      {/* Dry Period Predictions */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">{t('emergencyFund.dryPeriodWarning')}</h2>
          <CalendarIcon className="h-5 w-5 text-white/60" />
        </div>
        <div className="space-y-4">
          {transactionsLoading || goalsLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-24 bg-white/10 rounded-lg"></div>
              <div className="h-24 bg-white/10 rounded-lg"></div>
            </div>
          ) : dryPeriodPredictions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-white/60">{t('common.noData')}</p>
              <p className="text-sm text-white/40 mt-2">{t('common.loading')}</p>
            </div>
          ) : (
            dryPeriodPredictions.map((prediction, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border ${
                prediction.severity === 'medium'
                  ? 'bg-orange-500/10 border-orange-500/30'
                  : 'bg-blue-500/10 border-blue-500/30'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-white mb-1">{prediction.period}</p>
                  <div className="flex items-center space-x-4 text-sm">
                    <span className="text-white/60">
                      Predicted: ₹{prediction.predictedIncome.toLocaleString()}
                    </span>
                    <span className="text-white/60">
                      Average: ₹{prediction.averageIncome.toLocaleString()}
                    </span>
                  </div>
                </div>
                {prediction.severity === 'medium' && (
                  <ExclamationTriangleIcon className="h-5 w-5 text-orange-400" />
                )}
              </div>
              <p className="text-sm text-white/80 bg-white/5 p-2 rounded-lg">
                <span className="font-semibold">Recommendation:</span> {prediction.recommendation}
              </p>
            </div>
            ))
          )}
        </div>
      </motion.div>

      {/* Savings History */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
      >
        <h2 className="text-xl font-bold text-white mb-4">{t('emergencyFund.savingsHistory')}</h2>
        <div className="space-y-3">
          {transactionsLoading || goalsLoading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-white/10 rounded-lg"></div>
              ))}
            </div>
          ) : savingsHistory.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-white/60">{t('common.noData')}</p>
              <p className="text-sm text-white/40 mt-2">{t('emergencyFund.createEmergencyFund')}</p>
            </div>
          ) : (
            savingsHistory.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-white/5 backdrop-blur-sm rounded-lg border border-transparent hover:border-violet-500/20 transition-all">
                <div className="flex items-center space-x-3">
                  <ArrowTrendingUpIcon className="h-5 w-5 text-green-400" />
                  <span className="font-medium text-white">{item.month}</span>
                </div>
                <span className="font-bold text-green-400">+₹{item.amount.toLocaleString('en-IN')}</span>
              </div>
            ))
          )}
        </div>
      </motion.div>

      {/* Buffer Recommendations */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
      >
        <h2 className="text-xl font-bold text-white mb-4">{t('emergencyFund.dryPeriodWarning')}</h2>
        <div className="space-y-4">
          <div className="p-4 bg-white/5 backdrop-blur-sm rounded-lg border border-violet-500/20">
            <p className="text-sm font-semibold text-white mb-2">{t('emergencyFund.currentSavings')}</p>
            <p className="text-sm text-white/70 mb-3">
              {emergencyFund.monthsCovered} {t('emergencyFund.monthsCovered')}. 
              {t('emergencyFund.targetAmount')}: {emergencyFund.recommendedMonths} {t('emergencyFund.monthsCovered')}.
            </p>
            <div className="flex items-center space-x-2">
              <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full"
                  style={{ width: `${(emergencyFund.monthsCovered / emergencyFund.recommendedMonths) * 100}%` }}
                />
              </div>
              <span className="text-xs text-white/60">
                {((emergencyFund.monthsCovered / emergencyFund.recommendedMonths) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Add Funds Modal */}
      <AnimatePresence>
        {showAddFunds && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddFunds(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div 
                onClick={(e) => e.stopPropagation()}
                className="bg-slate-900/95 backdrop-blur-2xl rounded-2xl border border-blue-500/20 shadow-2xl w-full max-w-md"
              >
                <div className="flex items-center justify-between p-6 border-b border-blue-500/20">
                  <h2 className="text-2xl font-bold text-white">{t('emergencyFund.addFundsToEmergency')}</h2>
                  <button
                    onClick={() => setShowAddFunds(false)}
                    className="p-2 rounded-xl hover:bg-white/10 text-white transition-all"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
                
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      {t('emergencyFund.enterAmount')} (₹)
                    </label>
                    <input
                      type="number"
                      required
                      value={addFundsAmount}
                      onChange={(e) => setAddFundsAmount(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-blue-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                      placeholder={t('emergencyFund.enterAmount')}
                      min="1"
                      step="0.01"
                      autoFocus
                    />
                  </div>

                  <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <p className="text-sm text-white/80">
                      <span className="font-semibold">{t('emergencyFund.currentSavings')}:</span> ₹{emergencyFund.current.toLocaleString('en-IN')}
                    </p>
                    {addFundsAmount && parseFloat(addFundsAmount) > 0 && (
                      <p className="text-sm text-white/80 mt-1">
                        <span className="font-semibold">After adding:</span> ₹{(emergencyFund.current + parseFloat(addFundsAmount)).toLocaleString('en-IN')}
                      </p>
                    )}
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddFunds(false);
                        setAddFundsAmount('');
                      }}
                      disabled={addingFunds}
                      className="flex-1 px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-blue-500/20 rounded-xl text-white hover:bg-white/10 transition-all disabled:opacity-50"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleAddFunds}
                      disabled={addingFunds || !addFundsAmount || parseFloat(addFundsAmount) <= 0}
                      className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600/90 to-cyan-600/90 text-white rounded-xl hover:shadow-lg hover:shadow-blue-500/30 backdrop-blur-sm border border-blue-400/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {addingFunds ? t('common.loading') : t('emergencyFund.add')}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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

export default EmergencyFundPage;

