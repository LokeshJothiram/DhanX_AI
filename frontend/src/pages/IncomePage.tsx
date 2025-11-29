import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlusIcon,
  BanknotesIcon,
  CalendarIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { transactionsAPI } from '../services/api';
import { useData } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';
import AlertModal from '../components/AlertModal';

interface IncomeTransaction {
  date: string;
  source: string;
  amount: number;
  type: string;
}

const IncomePage: React.FC = () => {
  const { t } = useLanguage();
  const { showAgentAction, showSuccess } = useNotification();
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [incomeData, setIncomeData] = useState<IncomeTransaction[]>([]);
  const [incomeForm, setIncomeForm] = useState({
    amount: '',
    source: '',
    date: new Date().toISOString().split('T')[0],
    type: 'gig',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
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

  // Use pre-loaded transactions from DataContext
  const { incomeTransactions: sharedIncome, transactionsLoading, refreshTransactions, refreshGoals } = useData();

  useEffect(() => {
    // Use shared income transactions - no need to fetch separately
    if (!transactionsLoading) {
      setIncomeData(sharedIncome);
    }
  }, [sharedIncome, transactionsLoading]);

  // Calculate stats from actual income data
  const calculateStats = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const thisMonthIncome = incomeData
      .filter(item => {
        const itemDate = new Date(item.date);
        return itemDate.getMonth() === currentMonth && itemDate.getFullYear() === currentYear;
      })
      .reduce((sum, item) => sum + item.amount, 0);
    
    const total = incomeData.reduce((sum, item) => sum + item.amount, 0);
    const daysWithIncome = new Set(incomeData.map(item => item.date)).size;
    const average = daysWithIncome > 0 ? Math.round(total / daysWithIncome) : 0;
    
    return {
      total,
      thisMonth: thisMonthIncome,
      average,
      trend: '+0%', // Can be calculated later with previous period comparison
    };
  };

  const incomeStats = calculateStats();

  // Income Visualizations Component - 4 compact charts
  const IncomeVisualizations: React.FC<{ transactions: IncomeTransaction[]; selectedPeriod: 'week' | 'month' | 'year' }> = ({ transactions, selectedPeriod }) => {
    const now = new Date();
    
    // 1. Income Trend Chart (Bar Chart)
    const getTrendData = () => {
      let periods: Array<{ label: string; income: number }> = [];
      const periodCount = selectedPeriod === 'week' ? 7 : selectedPeriod === 'month' ? 4 : 6;
      
      if (selectedPeriod === 'week') {
        for (let i = 6; i >= 0; i--) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          periods.push({ label: date.toLocaleDateString('en-IN', { weekday: 'short' }), income: 0 });
        }
        transactions.forEach(txn => {
          const txnDate = new Date(txn.date);
          const daysDiff = Math.floor((now.getTime() - txnDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysDiff >= 0 && daysDiff <= 6) periods[6 - daysDiff].income += txn.amount;
        });
      } else if (selectedPeriod === 'month') {
        for (let i = 3; i >= 0; i--) {
          periods.push({ label: `W${4 - i}`, income: 0 });
        }
        transactions.forEach(txn => {
          const txnDate = new Date(txn.date);
          const daysDiff = Math.floor((now.getTime() - txnDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysDiff >= 0 && daysDiff <= 28) {
            const weekIndex = Math.floor(daysDiff / 7);
            if (weekIndex <= 3) periods[3 - weekIndex].income += txn.amount;
          }
        });
      } else {
        for (let i = 5; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          periods.push({ label: date.toLocaleDateString('en-IN', { month: 'short' }), income: 0 });
        }
        transactions.forEach(txn => {
          const txnDate = new Date(txn.date);
          const monthIndex = periods.findIndex(p => {
            const periodDate = new Date(p.label + ' 1, ' + now.getFullYear());
            return txnDate.getMonth() === periodDate.getMonth() && txnDate.getFullYear() === periodDate.getFullYear();
          });
          if (monthIndex !== -1) periods[monthIndex].income += txn.amount;
        });
      }
      return periods;
    };

    // 2. Income by Source (Donut Chart)
    const getSourceData = () => {
      const sourceMap: { [key: string]: number } = {};
      transactions.forEach(txn => {
        sourceMap[txn.source] = (sourceMap[txn.source] || 0) + txn.amount;
      });
      return Object.entries(sourceMap)
        .map(([source, amount]) => ({ source, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
    };

    // 3. Income Growth Rate (Sparkline)
    const getGrowthData = () => {
      const periods = getTrendData();
      if (periods.length < 2) return { trend: 0, values: [] };
      const values = periods.map(p => p.income);
      const recent = values.slice(-2);
      const growth = recent[0] > 0 && recent[1] > 0 
        ? ((recent[1] - recent[0]) / recent[0]) * 100 
        : recent[1] > recent[0] ? 100 : 0;
      return { trend: growth, values };
    };

    // 4. Income Distribution (Mini Heatmap)
    const getDistributionData = () => {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const dayMap: { [key: string]: number } = {};
      days.forEach(d => dayMap[d] = 0);
      transactions.forEach(txn => {
        const day = new Date(txn.date).toLocaleDateString('en-IN', { weekday: 'short' });
        if (dayMap[day] !== undefined) dayMap[day] += txn.amount;
      });
      return days.map(day => ({ day, amount: dayMap[day] }));
    };

    const trendData = getTrendData();
    const sourceData = getSourceData();
    const growthData = getGrowthData();
    const distributionData = getDistributionData();
    
    const maxTrend = Math.max(...trendData.map(p => p.income), 1000);
    const totalIncome = transactions.reduce((sum, t) => sum + t.amount, 0);
    const maxDist = Math.max(...distributionData.map(d => d.amount), 1);

    if (transactions.length === 0) {
      return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-48 flex items-center justify-center bg-slate-900/20 backdrop-blur-xl rounded-lg border border-violet-500/30 shadow-lg shadow-violet-900/10">
              <p className="text-white/50 text-sm">No data available</p>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Chart 1: Income Trend */}
        <div className="bg-slate-900/20 backdrop-blur-xl rounded-lg border border-violet-500/30 p-4 shadow-lg shadow-violet-900/10">
          <h3 className="text-sm font-semibold text-white/80 mb-3">Income Trend</h3>
          <div className="flex items-end justify-between h-32 gap-1">
            {trendData.map((period, idx) => {
              const height = (period.income / maxTrend) * 100;
              return (
                <div key={idx} className="flex-1 flex flex-col items-center group">
                  <div className="relative w-full flex items-end justify-center h-full">
                    <div
                      className="w-full bg-gradient-to-t from-green-500 to-emerald-300 rounded-t transition-all duration-300 hover:opacity-80"
                      style={{ height: `${height}%`, minHeight: height > 0 ? '2px' : '0' }}
                      title={`${period.label}: ₹${period.income.toLocaleString('en-IN')}`}
                    />
                  </div>
                  <p className="text-[10px] text-white/50 mt-1">{period.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 2: Income by Source */}
        <div className="bg-slate-900/20 backdrop-blur-xl rounded-lg border border-violet-500/30 p-4 shadow-lg shadow-violet-900/10">
          <h3 className="text-sm font-semibold text-white/80 mb-3">By Source</h3>
          <div className="space-y-2">
            {sourceData.slice(0, 4).map((item, idx) => {
              const percentage = (item.amount / totalIncome) * 100;
              const colors = ['from-green-500 to-emerald-400', 'from-blue-500 to-cyan-400', 'from-purple-500 to-pink-400', 'from-orange-500 to-amber-400'];
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/70 truncate flex-1">{item.source}</span>
                    <span className="text-white font-semibold ml-2">₹{item.amount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1.5">
                    <div className={`h-full rounded-full bg-gradient-to-r ${colors[idx % colors.length]}`} style={{ width: `${percentage}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 3: Growth Rate */}
        <div className="bg-slate-900/20 backdrop-blur-xl rounded-lg border border-violet-500/30 p-4 shadow-lg shadow-violet-900/10">
          <h3 className="text-sm font-semibold text-white/80 mb-3">Growth Rate</h3>
          <div className="flex items-center justify-center h-32">
            <div className="text-center">
              <div className={`text-3xl font-bold ${growthData.trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {growthData.trend >= 0 ? '+' : ''}{growthData.trend.toFixed(1)}%
              </div>
              <p className="text-xs text-white/50 mt-2">vs previous period</p>
            </div>
          </div>
          {growthData.values.length > 0 && (
            <div className="flex items-end justify-center gap-1 h-12 mt-2">
              {growthData.values.map((val, idx) => {
                const maxVal = Math.max(...growthData.values);
                const height = maxVal > 0 ? (val / maxVal) * 100 : 0;
                return (
                  <div
                    key={idx}
                    className="flex-1 bg-gradient-to-t from-violet-500 to-purple-300 rounded-t"
                    style={{ height: `${height}%`, minHeight: '2px' }}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Chart 4: Weekly Distribution */}
        <div className="bg-slate-900/20 backdrop-blur-xl rounded-lg border border-violet-500/30 p-4 shadow-lg shadow-violet-900/10">
          <h3 className="text-sm font-semibold text-white/80 mb-3">Weekly Pattern</h3>
          <div className="grid grid-cols-7 gap-1 h-32">
            {distributionData.map((item, idx) => {
              const height = (item.amount / maxDist) * 100;
              return (
                <div key={idx} className="flex flex-col items-center justify-end">
                  <div
                    className="w-full bg-gradient-to-t from-emerald-500 to-green-300 rounded-t transition-all duration-300"
                    style={{ height: `${height}%`, minHeight: '2px' }}
                    title={`${item.day}: ₹${item.amount.toLocaleString('en-IN')}`}
                  />
                  <p className="text-[9px] text-white/50 mt-1">{item.day}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
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
          <h1 className="text-3xl font-bold text-white mb-2">{t('income.title')}</h1>
          <p className="text-white/70">{t('income.subtitle')}</p>
        </div>
        <button 
          onClick={() => setShowAddIncome(true)}
          className="mt-4 sm:mt-0 flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-violet-600/90 via-purple-600/90 to-fuchsia-600/90 text-white rounded-xl hover:shadow-lg hover:shadow-violet-500/30 backdrop-blur-sm border border-violet-400/30 transition-all"
        >
          <PlusIcon className="h-5 w-5" />
          <span>{t('income.addIncome')}</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl hover:border-violet-400/30 transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/60">{t('income.totalIncome')}</p>
            <BanknotesIcon className="h-5 w-5 text-violet-400" />
          </div>
          <p className="text-2xl font-bold text-white">₹{incomeStats.total.toLocaleString()}</p>
          <p className="text-xs text-white/50 mt-1">{t('income.thisPeriod')}</p>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          transition={{ delay: 0.1 }}
          className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl hover:border-violet-400/30 transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/60">{t('income.thisMonth')}</p>
            <CalendarIcon className="h-5 w-5 text-green-400" />
          </div>
          <p className="text-2xl font-bold text-white">₹{incomeStats.thisMonth.toLocaleString()}</p>
          <p className="text-xs text-green-400 mt-1">{incomeStats.trend}</p>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          transition={{ delay: 0.2 }}
          className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl hover:border-violet-400/30 transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/60">{t('income.dailyAverage')}</p>
            <ChartBarIcon className="h-5 w-5 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white">₹{incomeStats.average}</p>
          <p className="text-xs text-white/50 mt-1">{t('income.perDay')}</p>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          transition={{ delay: 0.3 }}
          className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl hover:border-violet-400/30 transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/60">{t('spending.trend')}</p>
            <ArrowTrendingUpIcon className="h-5 w-5 text-green-400" />
          </div>
          <p className="text-2xl font-bold text-white">{incomeStats.trend}</p>
          <p className="text-xs text-white/50 mt-1">vs last period</p>
        </motion.div>
      </div>

      {/* Period Selector */}
      <div className="flex space-x-2">
        {(['week', 'month', 'year'] as const).map((period) => (
          <button
            key={period}
            onClick={() => setSelectedPeriod(period)}
            className={`px-4 py-2 rounded-xl font-medium transition-all backdrop-blur-sm ${
              selectedPeriod === period
                ? 'bg-gradient-to-r from-violet-600/90 to-purple-600/90 text-white shadow-lg shadow-violet-500/20 border border-violet-400/30'
                : 'bg-white/5 text-white/70 hover:bg-white/10 border border-transparent hover:border-violet-500/20'
            }`}
          >
            {t(`spending.${period}`)}
          </button>
        ))}
      </div>

      {/* Income Pattern Visualization */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
      >
        <h2 className="text-xl font-bold text-white mb-4">{t('income.incomeHistory')}</h2>
        {transactionsLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-48 flex items-center justify-center bg-slate-900/20 backdrop-blur-xl rounded-lg border border-violet-500/30 shadow-lg shadow-violet-900/10">
                <div className="animate-pulse text-white/50">Loading...</div>
              </div>
            ))}
          </div>
        ) : (
          <IncomeVisualizations transactions={incomeData} selectedPeriod={selectedPeriod} />
        )}
      </motion.div>

      {/* Recent Income Transactions */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
      >
        <h2 className="text-xl font-bold text-white mb-4">{t('income.incomeHistory')}</h2>
        {transactionsLoading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-white/60">{t('common.loading')}</p>
          </div>
        ) : incomeData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <p className="text-white/60 mb-4">{t('income.noIncomeData')}</p>
            <p className="text-sm text-white/40 text-center">
              {t('income.connectPaymentGateway')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {incomeData.map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 bg-white/5 backdrop-blur-sm rounded-lg hover:bg-white/10 border border-transparent hover:border-violet-500/20 transition-all"
              >
                <div className="flex items-center space-x-4">
                  <div className="p-3 rounded-lg bg-green-500/20 backdrop-blur-sm border border-green-500/30">
                    <BanknotesIcon className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white">{item.source}</p>
                    <p className="text-sm text-white/50">{item.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-400">+₹{item.amount.toLocaleString()}</p>
                  <p className="text-xs text-white/50 capitalize">{item.type}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Add Income Modal */}
      <AnimatePresence>
        {showAddIncome && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddIncome(false)}
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
                className="bg-slate-900/95 backdrop-blur-2xl rounded-2xl border border-violet-500/20 shadow-2xl w-full max-w-md"
              >
                <div className="flex items-center justify-between p-6 border-b border-violet-500/20">
                  <h2 className="text-2xl font-bold text-white">{t('income.addIncomeEntry')}</h2>
                  <button
                    onClick={() => setShowAddIncome(false)}
                    className="p-2 rounded-xl hover:bg-white/10 text-white transition-all"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
                
                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (isSubmitting) return; // Prevent double submission
                    
                    setIsSubmitting(true);
                    try {
                      // Validate amount
                      const amount = parseFloat(incomeForm.amount);
                      if (isNaN(amount) || amount <= 0) {
                        throw new Error('Please enter a valid amount greater than 0');
                      }
                      
                      // Save to database
                      await transactionsAPI.createTransaction({
                        amount: amount,
                        type: 'income',
                        description: incomeForm.source.trim() || 'Income',
                        category: incomeForm.type === 'gig' ? 'cash_income' : incomeForm.type,
                        source: incomeForm.type,
                        transaction_date: new Date(incomeForm.date).toISOString(),
                      });
                      
                      // Refresh shared transactions - this will update all pages automatically
                      await refreshTransactions();
                      
                      // Refresh goals to show updated amounts after automatic allocation
                      await refreshGoals();
                      
                      setShowAddIncome(false);
                      setIncomeForm({
                        amount: '',
                        source: '',
                        date: new Date().toISOString().split('T')[0],
                        type: 'gig',
                      });
                      
                      // Show success message with allocation info
                      setAlertModal({
                        isOpen: true,
                        title: t('common.success'),
                        message: `${t('income.incomeAdded')} If you have active goals, the system will automatically allocate a portion to your goals and emergency fund.`,
                        type: 'success',
                      });
                      
                      // Show toast notification about auto-allocation
                      setTimeout(() => {
                        showAgentAction(
                          `₹${amount.toLocaleString('en-IN')} income added! AI is automatically allocating funds to your goals. Check Goals page in a moment!`,
                          '💰 Income Processing'
                        );
                      }, 1000); // Delay to show after modal
                      
                    } catch (err: any) {
                      console.error('Error saving income:', err);
                      const errorMessage = err.response?.data?.detail || err.message || 'Failed to add income. Please try again.';
                      setAlertModal({
                        isOpen: true,
                        title: t('common.error'),
                        message: errorMessage,
                        type: 'error',
                      });
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                  className="p-6 space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      {t('income.amount')} (₹)
                    </label>
                    <input
                      type="number"
                      required
                      value={incomeForm.amount}
                      onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                      placeholder={t('income.enterAmount')}
                      min="1"
                      step="0.01"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      {t('income.source')}
                    </label>
                    <input
                      type="text"
                      required
                      value={incomeForm.source}
                      onChange={(e) => setIncomeForm({ ...incomeForm, source: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                      placeholder={t('income.enterSource')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      {t('income.date')}
                    </label>
                    <input
                      type="date"
                      required
                      value={incomeForm.date}
                      onChange={(e) => setIncomeForm({ ...incomeForm, date: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      {t('income.type')}
                    </label>
                    <select
                      value={incomeForm.type}
                      onChange={(e) => setIncomeForm({ ...incomeForm, type: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                    >
                      <option value="gig" className="bg-slate-900">{t('income.gig')}</option>
                      <option value="cash" className="bg-slate-900">{t('income.other')}</option>
                      <option value="bank" className="bg-slate-900">{t('income.other')}</option>
                      <option value="other" className="bg-slate-900">{t('income.other')}</option>
                    </select>
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowAddIncome(false)}
                      className="flex-1 px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white hover:bg-white/10 transition-all"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 px-4 py-2.5 bg-gradient-to-r from-violet-600/90 to-purple-600/90 text-white rounded-xl hover:shadow-lg hover:shadow-violet-500/30 backdrop-blur-sm border border-violet-400/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      {isSubmitting ? (
                        <>
                          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Adding...</span>
                        </>
                      ) : (
                        <span>{t('income.addIncome')}</span>
                      )}
                    </button>
                  </div>
                </form>
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

export default IncomePage;

