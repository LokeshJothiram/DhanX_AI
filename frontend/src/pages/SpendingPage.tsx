import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChartBarIcon,
  ExclamationTriangleIcon,
  ShoppingBagIcon,
  HomeIcon,
  TruckIcon,
  CreditCardIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { transactionsAPI, authAPI } from '../services/api';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AlertModal from '../components/AlertModal';
import { PencilIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface SpendingTransaction {
  date: string;
  description: string;
  amount: number;
  category: string;
}

const SpendingPage: React.FC = () => {
  const { t } = useLanguage();
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year'>('year');
  const [spendingData, setSpendingData] = useState<SpendingTransaction[]>([]);
  const [showBudgetEdit, setShowBudgetEdit] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [updatingBudget, setUpdatingBudget] = useState(false);
  const [showAddSpending, setShowAddSpending] = useState(false);
  const [spendingForm, setSpendingForm] = useState({
    amount: '',
    description: '',
    category: 'Other',
    date: new Date().toISOString().split('T')[0],
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
  
  const { user, login } = useAuth(); // Get user to access monthly_budget

  // Use pre-loaded transactions from DataContext
  const { 
    spendingTransactions: sharedSpending, 
    incomeTransactions: sharedIncome,
    transactionsLoading, 
    refreshTransactions 
  } = useData();
  
  // Category options for spending
  const spendingCategories = [
    { value: 'Food', label: 'Food' },
    { value: 'Transport', label: 'Transport' },
    { value: 'Bills', label: 'Bills' },
    { value: 'Health', label: 'Health' },
    { value: 'Shopping', label: 'Shopping' },
    { value: 'Other', label: 'Other' },
  ];

  useEffect(() => {
    // Use shared spending transactions - no need to fetch separately
    if (!transactionsLoading) {
      // Ensure amounts are numbers and filter out invalid data
      const validSpending = (sharedSpending || []).filter(item => 
        item && item.date && (item.amount !== undefined && item.amount !== null)
      ).map(item => ({
        ...item,
        amount: Number(item.amount) || 0,
      }));
      setSpendingData(validSpending);
    }
  }, [sharedSpending, transactionsLoading]);
  
  // Memoize filtered and sorted recent transactions for performance
  const recentTransactions = useMemo(() => {
    return spendingData
      .filter(item => item.date && !isNaN(new Date(item.date).getTime()))
      .sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA; // Most recent first
      })
      .slice(0, 20);
  }, [spendingData]);
      
  // Filter spending data based on selected period
  const getFilteredSpendingData = () => {
    const now = new Date();
    const filtered = spendingData.filter(item => {
      if (!item.date) return false;
      const itemDate = new Date(item.date);
      if (isNaN(itemDate.getTime())) return false; // Invalid date
      
      const itemTime = itemDate.getTime();
      const nowTime = now.getTime();
      
      if (selectedPeriod === 'week') {
        const weekAgo = nowTime - (7 * 24 * 60 * 60 * 1000);
        return itemTime >= weekAgo;
      } else if (selectedPeriod === 'month') {
        return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
      } else if (selectedPeriod === 'year') {
        return itemDate.getFullYear() === now.getFullYear();
            }
      return true;
    });
    // Sort by date descending (most recent first)
    return filtered.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });
  };

  const filteredSpendingData = getFilteredSpendingData();

  // Calculate stats from actual data
  const spendingStats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    
    // Calculate current month spending
    const thisMonthSpending = spendingData
      .filter(item => {
        if (!item || !item.date) return false;
        const itemDate = new Date(item.date);
        if (isNaN(itemDate.getTime())) return false;
        return itemDate.getMonth() === currentMonth && itemDate.getFullYear() === currentYear;
      })
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    
    // Calculate last month spending for trend
    const lastMonthSpending = spendingData
      .filter(item => {
        if (!item || !item.date) return false;
        const itemDate = new Date(item.date);
        if (isNaN(itemDate.getTime())) return false;
        return itemDate.getMonth() === lastMonth && itemDate.getFullYear() === lastMonthYear;
      })
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    
    // Calculate monthly income from income transactions
    const monthlyIncome = (sharedIncome || [])
      .filter(item => {
        if (!item || !item.date) return false;
        const itemDate = new Date(item.date);
        if (isNaN(itemDate.getTime())) return false;
        return itemDate.getMonth() === currentMonth && itemDate.getFullYear() === currentYear;
      })
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    
    // Use custom budget if set, otherwise calculate as 40% of monthly income (or default to 5000)
    // 40% for spending/expenses, 40% for savings/goals, 20% for investment
    const customBudget = user?.monthly_budget ? Number(user.monthly_budget) : null;
    const calculatedBudget = monthlyIncome > 0 ? Math.round(monthlyIncome * 0.4) : 5000;
    const budget = customBudget || calculatedBudget;
    const remaining = budget - thisMonthSpending;
    
    // Calculate trend (percentage change from last month)
    let trend = '0%';
    let trendType: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (lastMonthSpending > 0) {
      const trendPercent = ((thisMonthSpending - lastMonthSpending) / lastMonthSpending) * 100;
      trend = `${trendPercent >= 0 ? '+' : ''}${trendPercent.toFixed(1)}%`;
      trendType = trendPercent < 0 ? 'positive' : trendPercent > 0 ? 'negative' : 'neutral';
    } else if (thisMonthSpending > 0) {
      trend = '+100%';
      trendType = 'negative';
    }
    
    // Calculate total for selected period (filtered data)
    const total = filteredSpendingData.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    
    // Also calculate total all-time spending for year view
    const totalAllTime = spendingData.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    
    return {
      total: selectedPeriod === 'year' ? totalAllTime : total, // Use all-time for year, filtered for others
      thisMonth: thisMonthSpending,
      budget,
      remaining: remaining > 0 ? remaining : 0,
      trend,
      trendType,
      monthlyIncome,
    };
  }, [spendingData, filteredSpendingData, selectedPeriod, sharedIncome, user]);

  // Calculate category spending from filtered data
  const calculateCategorySpending = () => {
    const categoryMap: { [key: string]: { amount: number; icon: any; color: string } } = {
      'Food': { amount: 0, icon: ShoppingBagIcon, color: 'from-orange-500 to-red-500' },
      'Transport': { amount: 0, icon: TruckIcon, color: 'from-blue-500 to-cyan-500' },
      'Bills': { amount: 0, icon: CreditCardIcon, color: 'from-purple-500 to-pink-500' },
      'Health': { amount: 0, icon: HomeIcon, color: 'from-green-500 to-emerald-500' },
      'Shopping': { amount: 0, icon: ShoppingBagIcon, color: 'from-pink-500 to-rose-500' },
      'Other': { amount: 0, icon: ChartBarIcon, color: 'from-gray-500 to-slate-500' },
    };

    filteredSpendingData.forEach(item => {
      const amount = Number(item.amount) || 0;
      if (categoryMap[item.category]) {
        categoryMap[item.category].amount += amount;
      } else {
        categoryMap['Other'].amount += amount;
      }
    });

    const total = filteredSpendingData.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    
    return Object.entries(categoryMap)
      .filter(([_, data]) => data.amount > 0)
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        percentage: total > 0 ? Math.round((data.amount / total) * 100) : 0,
        icon: data.icon,
        color: data.color,
      }))
      .sort((a, b) => b.amount - a.amount);
  };

  const categorySpending = calculateCategorySpending();

  // Generate dynamic alerts based on actual spending patterns
  const generateAlerts = () => {
    const alerts: Array<{ type: 'success' | 'warning' | 'error'; message: string }> = [];
    const { thisMonth, budget, remaining, trendType } = spendingStats;
    
    // Budget alerts
    if (budget > 0) {
      const budgetPercentage = (thisMonth / budget) * 100;
      if (budgetPercentage >= 100) {
        alerts.push({
          type: 'error',
          message: `You've exceeded your monthly budget by ₹${Math.abs(remaining).toLocaleString()}. Consider reducing expenses.`,
        });
      } else if (budgetPercentage >= 90) {
        alerts.push({
          type: 'warning',
          message: `You've used ${budgetPercentage.toFixed(0)}% of your monthly budget. Only ₹${remaining.toLocaleString()} remaining.`,
        });
      } else if (budgetPercentage <= 50 && thisMonth > 0) {
        alerts.push({
          type: 'success',
          message: `Great! You're on track. You've only used ${budgetPercentage.toFixed(0)}% of your monthly budget.`,
        });
      }
    }
    
    // Trend alerts
    if (trendType === 'negative' && spendingStats.trend !== '0%') {
      const trendValue = parseFloat(spendingStats.trend);
      if (Math.abs(trendValue) > 20) {
        alerts.push({
          type: 'warning',
          message: `Your spending increased by ${Math.abs(trendValue).toFixed(0)}% compared to last month. Review your expenses.`,
        });
      }
    } else if (trendType === 'positive' && spendingStats.trend !== '0%') {
      alerts.push({
        type: 'success',
        message: `Good news! Your spending decreased by ${Math.abs(parseFloat(spendingStats.trend)).toFixed(0)}% compared to last month.`,
      });
    }
    
    // Category-based alerts
    const categorySpending = calculateCategorySpending();
    const foodSpending = categorySpending.find(cat => cat.category === 'Food');
    if (foodSpending && foodSpending.percentage > 40) {
      alerts.push({
      type: 'warning',
        message: `Food spending is ${foodSpending.percentage}% of your total expenses. Consider meal planning to reduce costs.`,
      });
    }
    
    return alerts;
  };

  const alerts = generateAlerts();

  // Spending Visualizations Component - 4 compact charts
  const SpendingVisualizations: React.FC<{ transactions: SpendingTransaction[]; selectedPeriod: 'week' | 'month' | 'year'; budget: number }> = ({ transactions, selectedPeriod, budget }) => {
    const now = new Date();
    
    // 1. Spending Trend Chart (Bar Chart)
    const getTrendData = () => {
      let periods: Array<{ label: string; spending: number }> = [];
      
      if (selectedPeriod === 'week') {
        for (let i = 6; i >= 0; i--) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          periods.push({ label: date.toLocaleDateString('en-IN', { weekday: 'short' }), spending: 0 });
        }
        transactions.forEach(txn => {
          const txnDate = new Date(txn.date);
          const daysDiff = Math.floor((now.getTime() - txnDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysDiff >= 0 && daysDiff <= 6) periods[6 - daysDiff].spending += Number(txn.amount) || 0;
        });
      } else if (selectedPeriod === 'month') {
        for (let i = 3; i >= 0; i--) {
          periods.push({ label: `W${4 - i}`, spending: 0 });
        }
        transactions.forEach(txn => {
          const txnDate = new Date(txn.date);
          const daysDiff = Math.floor((now.getTime() - txnDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysDiff >= 0 && daysDiff <= 28) {
            const weekIndex = Math.floor(daysDiff / 7);
            if (weekIndex <= 3) periods[3 - weekIndex].spending += Number(txn.amount) || 0;
          }
        });
      } else {
        for (let i = 5; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          periods.push({ label: date.toLocaleDateString('en-IN', { month: 'short' }), spending: 0 });
        }
        transactions.forEach(txn => {
          const txnDate = new Date(txn.date);
          const monthIndex = periods.findIndex(p => {
            const periodDate = new Date(p.label + ' 1, ' + now.getFullYear());
            return txnDate.getMonth() === periodDate.getMonth() && txnDate.getFullYear() === periodDate.getFullYear();
          });
          if (monthIndex !== -1) periods[monthIndex].spending += Number(txn.amount) || 0;
        });
      }
      return periods;
    };

    // 2. Spending by Category (Progress Bars)
    const getCategoryData = () => {
      const categoryMap: { [key: string]: number } = {};
      transactions.forEach(txn => {
        categoryMap[txn.category] = (categoryMap[txn.category] || 0) + (Number(txn.amount) || 0);
      });
      return Object.entries(categoryMap)
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 4);
    };

    // 3. Budget vs Actual (Comparison)
    const getBudgetComparison = () => {
      const totalSpending = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const budgetPerPeriod = selectedPeriod === 'week' ? budget / 4.33 : selectedPeriod === 'month' ? budget : budget * 12;
      return { totalSpending, budgetPerPeriod, percentage: budgetPerPeriod > 0 ? (totalSpending / budgetPerPeriod) * 100 : 0 };
    };

    // 4. Spending Pattern (Weekly Heatmap)
    const getPatternData = () => {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const dayMap: { [key: string]: number } = {};
      days.forEach(d => dayMap[d] = 0);
      transactions.forEach(txn => {
        const day = new Date(txn.date).toLocaleDateString('en-IN', { weekday: 'short' });
        if (dayMap[day] !== undefined) dayMap[day] += Number(txn.amount) || 0;
      });
      return days.map(day => ({ day, amount: dayMap[day] }));
    };

    const trendData = getTrendData();
    const categoryData = getCategoryData();
    const budgetComparison = getBudgetComparison();
    const patternData = getPatternData();
    
    const maxTrend = Math.max(...trendData.map(p => p.spending), budgetComparison.budgetPerPeriod || 1000);
    const totalSpending = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const maxCategory = Math.max(...categoryData.map(c => c.amount), 1);
    const maxPattern = Math.max(...patternData.map(d => d.amount), 1);

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
        {/* Chart 1: Spending Trend */}
        <div className="bg-slate-900/20 backdrop-blur-xl rounded-lg border border-violet-500/30 p-4 shadow-lg shadow-violet-900/10">
          <h3 className="text-sm font-semibold text-white/80 mb-3">Spending Trend</h3>
          <div className="flex items-end justify-between h-32 gap-1">
            {trendData.map((period, idx) => {
              const height = (period.spending / maxTrend) * 100;
              const isOverBudget = budget > 0 && period.spending > (budgetComparison.budgetPerPeriod / trendData.length);
              return (
                <div key={idx} className="flex-1 flex flex-col items-center group">
                  <div className="relative w-full flex items-end justify-center h-full">
                    <div
                      className={`w-full rounded-t transition-all duration-300 hover:opacity-80 ${
                        isOverBudget ? 'bg-gradient-to-t from-red-600 to-red-400' : 'bg-gradient-to-t from-orange-500 to-orange-300'
                      }`}
                      style={{ height: `${height}%`, minHeight: height > 0 ? '2px' : '0' }}
                      title={`${period.label}: ₹${period.spending.toLocaleString('en-IN')}`}
                    />
                  </div>
                  <p className="text-[10px] text-white/50 mt-1">{period.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 2: Spending by Category */}
        <div className="bg-slate-900/20 backdrop-blur-xl rounded-lg border border-violet-500/30 p-4 shadow-lg shadow-violet-900/10">
          <h3 className="text-sm font-semibold text-white/80 mb-3">By Category</h3>
          <div className="space-y-2">
            {categoryData.map((item, idx) => {
              const percentage = (item.amount / maxCategory) * 100;
              const colors = ['from-orange-500 to-red-400', 'from-blue-500 to-cyan-400', 'from-purple-500 to-pink-400', 'from-green-500 to-emerald-400'];
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/70 truncate flex-1">{item.category}</span>
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

        {/* Chart 3: Budget vs Actual */}
        <div className="bg-slate-900/20 backdrop-blur-xl rounded-lg border border-violet-500/30 p-4 shadow-lg shadow-violet-900/10">
          <h3 className="text-sm font-semibold text-white/80 mb-3">Budget Status</h3>
          {budget > 0 ? (
            <>
              <div className="flex items-center justify-center h-24 mb-3">
                <div className="text-center">
                  <div className={`text-3xl font-bold ${budgetComparison.percentage > 100 ? 'text-red-400' : budgetComparison.percentage > 80 ? 'text-orange-400' : 'text-green-400'}`}>
                    {budgetComparison.percentage.toFixed(0)}%
                  </div>
                  <p className="text-xs text-white/50 mt-1">of budget used</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-white/60">Spent</span>
                  <span className="text-white font-semibold">₹{budgetComparison.totalSpending.toLocaleString('en-IN')}</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div
                    className={`h-full rounded-full transition-all ${
                      budgetComparison.percentage > 100 ? 'bg-gradient-to-r from-red-600 to-red-400' :
                      budgetComparison.percentage > 80 ? 'bg-gradient-to-r from-orange-500 to-orange-400' :
                      'bg-gradient-to-r from-green-500 to-emerald-400'
                    }`}
                    style={{ width: `${Math.min(budgetComparison.percentage, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/60">Budget</span>
                  <span className="text-white font-semibold">₹{budgetComparison.budgetPerPeriod.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="h-32 flex items-center justify-center">
              <p className="text-white/50 text-xs text-center">Set a budget to see comparison</p>
            </div>
          )}
        </div>

        {/* Chart 4: Weekly Pattern */}
        <div className="bg-slate-900/20 backdrop-blur-xl rounded-lg border border-violet-500/30 p-4 shadow-lg shadow-violet-900/10">
          <h3 className="text-sm font-semibold text-white/80 mb-3">Weekly Pattern</h3>
          <div className="grid grid-cols-7 gap-1 h-32">
            {patternData.map((item, idx) => {
              const height = (item.amount / maxPattern) * 100;
              return (
                <div key={idx} className="flex flex-col items-center justify-end">
                  <div
                    className="w-full bg-gradient-to-t from-red-500 to-orange-300 rounded-t transition-all duration-300"
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
          <h1 className="text-3xl font-bold text-white mb-2">{t('spending.title')}</h1>
          <p className="text-white/70">{t('spending.subtitle')}</p>
        </div>
        <button 
          onClick={() => setShowAddSpending(true)}
          className="mt-4 sm:mt-0 flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-orange-600/90 via-red-600/90 to-pink-600/90 text-white rounded-xl hover:shadow-lg hover:shadow-orange-500/30 backdrop-blur-sm border border-orange-400/30 transition-all"
        >
          <PlusIcon className="h-5 w-5" />
          <span>{t('spending.addSpending')}</span>
        </button>
      </div>

      {/* Dynamic Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-xl backdrop-blur-sm border ${
                alert.type === 'success' 
                  ? 'bg-green-500/10 border-green-500/30' 
                  : alert.type === 'warning'
                  ? 'bg-orange-500/10 border-orange-500/30'
                  : 'bg-red-500/10 border-red-500/30'
              }`}
            >
              <div className="flex items-start space-x-3">
                <ExclamationTriangleIcon className={`h-5 w-5 mt-0.5 ${
                  alert.type === 'success' 
                    ? 'text-green-400' 
                    : alert.type === 'warning'
                    ? 'text-orange-400'
                    : 'text-red-400'
                }`} />
                <p className={`text-sm ${
                  alert.type === 'success' 
                    ? 'text-green-300' 
                    : alert.type === 'warning'
                    ? 'text-orange-300'
                    : 'text-red-300'
                }`}>
                  {alert.message}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl hover:border-violet-400/30 transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/60">{t('spending.totalSpending')}</p>
            <ChartBarIcon className="h-5 w-5 text-red-400" />
          </div>
          <p className="text-2xl font-bold text-white">
            ₹{selectedPeriod === 'month' 
              ? spendingStats.thisMonth.toLocaleString() 
              : selectedPeriod === 'week'
              ? filteredSpendingData.reduce((sum, item) => sum + (Number(item.amount) || 0), 0).toLocaleString()
              : spendingStats.total.toLocaleString()}
          </p>
          <p className="text-xs text-white/50 mt-1">
            {selectedPeriod === 'week' ? t('spending.thisWeek') : selectedPeriod === 'month' ? t('spending.thisMonth') : t('spending.thisYear')}
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          transition={{ delay: 0.1 }}
          className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl hover:border-violet-400/30 transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/60">{t('spending.budget')}</p>
            <CreditCardIcon className="h-5 w-5 text-blue-400" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-white">₹{spendingStats.budget.toLocaleString()}</p>
              <p className="text-xs text-white/50 mt-1">
                {`${user?.monthly_budget 
                  ? t('spending.customBudget')
                  : spendingStats.monthlyIncome > 0 
                  ? `${t('spending.suggested')} 40% ${t('spending.ofMonthlyIncome')} (₹${spendingStats.monthlyIncome.toLocaleString()})`
                  : t('spending.defaultBudget')} • ${t('spending.monthlyBudgetHint')}`}
              </p>
            </div>
            <button
              onClick={() => {
                setBudgetInput(user?.monthly_budget?.toString() || spendingStats.budget.toString());
                setShowBudgetEdit(true);
              }}
              className="p-2 hover:bg-white/10 rounded-lg transition-all"
              title={t('spending.editBudget')}
            >
              <PencilIcon className="h-4 w-4 text-white/70 hover:text-white" />
            </button>
          </div>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          transition={{ delay: 0.2 }}
          className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl hover:border-violet-400/30 transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/60">{t('spending.remaining')}</p>
            <ChartBarIcon className="h-5 w-5 text-green-400" />
          </div>
          <p className="text-2xl font-bold text-green-400">₹{spendingStats.remaining.toLocaleString()}</p>
          <p className="text-xs text-white/50 mt-1">{t('spending.available')}</p>
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
            <ChartBarIcon className="h-5 w-5 text-green-400" />
          </div>
          <p className={`text-2xl font-bold ${
            spendingStats.trendType === 'positive' ? 'text-green-400' : 
            spendingStats.trendType === 'negative' ? 'text-red-400' : 
            'text-white'
          }`}>
            {spendingStats.trend}
          </p>
          <p className="text-xs text-white/50 mt-1">{t('spending.vsLastMonth')}</p>
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

      {/* Category Breakdown */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
      >
        <h2 className="text-xl font-bold text-white mb-4">{t('spending.spendingByCategory')}</h2>
        {transactionsLoading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-white/60">{t('common.loading')}</p>
          </div>
        ) : categorySpending.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <p className="text-white/60 mb-4">{t('spending.noSpendingCategories')}</p>
            <p className="text-sm text-white/40 text-center">
              Connect a payment gateway in the Connections page to see your spending by category.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {categorySpending.map((item, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${item.color} bg-opacity-20`}>
                    <item.icon className="h-5 w-5 text-white" />
                  </div>
                  <span className="font-medium text-white">{item.category}</span>
                </div>
                <span className="font-bold text-white">₹{item.amount}</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${item.color} rounded-full`}
                  style={{ width: `${item.percentage}%` }}
                />
              </div>
            </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Spending Chart */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
      >
        <h2 className="text-xl font-bold text-white mb-4">{t('spending.spendingTrends')}</h2>
        {transactionsLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-48 flex items-center justify-center bg-slate-900/20 backdrop-blur-xl rounded-lg border border-violet-500/30 shadow-lg shadow-violet-900/10">
                <div className="animate-pulse text-white/50">Loading...</div>
              </div>
            ))}
          </div>
        ) : (
          <SpendingVisualizations transactions={spendingData} selectedPeriod={selectedPeriod} budget={user?.monthly_budget || 0} />
        )}
      </motion.div>

      {/* Recent Transactions - Always show most recent regardless of period filter */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
      >
        <h2 className="text-xl font-bold text-white mb-4">{t('spending.recentExpenses')}</h2>
        {transactionsLoading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-white/60">{t('common.loading')}</p>
          </div>
        ) : spendingData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <p className="text-white/60 mb-4">{t('spending.noSpendingTransactions')}</p>
            <p className="text-sm text-white/40 text-center">
              Connect a payment gateway in the Connections page to see your spending transactions here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentTransactions.map((item, index) => {
              // Format date for display
              const itemDate = new Date(item.date);
              const formattedDate = isNaN(itemDate.getTime()) 
                ? item.date 
                : itemDate.toLocaleDateString('en-IN', { 
                    day: 'numeric', 
                    month: 'short', 
                    year: itemDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined 
                  });
              
              return (
              <div
                key={index}
                className="flex items-center justify-between p-4 bg-white/5 backdrop-blur-sm rounded-lg hover:bg-white/10 border border-transparent hover:border-violet-500/20 transition-all"
              >
                <div className="flex items-center space-x-4">
                  <div className="p-3 rounded-lg bg-red-500/20 backdrop-blur-sm border border-red-500/30">
                    <ChartBarIcon className="h-5 w-5 text-red-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white">{item.description || t('spending.recentExpenses')}</p>
                    <p className="text-sm text-white/50">{item.category || 'Other'} • {formattedDate}</p>
                  </div>
                </div>
                <p className="font-bold text-red-400">-₹{Number(item.amount || 0).toLocaleString()}</p>
              </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Budget Edit Modal */}
      <AnimatePresence>
      {showBudgetEdit && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowBudgetEdit(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900/95 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl w-full max-w-md"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white">{t('spending.setMonthlyBudget')}</h2>
              <button
                onClick={() => setShowBudgetEdit(false)}
                className="text-white/70 hover:text-white"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">{t('spending.monthlyBudget')}</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-violet-500/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-violet-400/50"
                  placeholder={t('spending.enterMonthlyBudget')}
                />
                <p className="text-xs text-white/50 mt-2">
                  {spendingStats.monthlyIncome > 0 && (
                    <>{t('spending.suggested')}: ₹{Math.round(spendingStats.monthlyIncome * 0.4).toLocaleString()} (40% {t('spending.ofMonthlyIncome')})</>
                  )}
                </p>
              </div>
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowBudgetEdit(false);
                    setBudgetInput('');
                  }}
                  className="flex-1 px-4 py-2 bg-white/5 border border-violet-500/20 text-white rounded-lg hover:bg-white/10 transition-all"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const budgetValue = parseFloat(budgetInput);
                    if (isNaN(budgetValue) || budgetValue <= 0) {
                      setAlertModal({
                        isOpen: true,
                        title: t('common.error'),
                        message: t('spending.enterMonthlyBudget'),
                        type: 'error',
                      });
                      return;
                    }
                    try {
                      setUpdatingBudget(true);
                      await authAPI.updateUser({ monthly_budget: budgetValue });
                      // Refresh user data
                      const updatedUser = await authAPI.getCurrentUser();
                      // Update auth context - reload to refresh user
                      window.location.reload();
                    } catch (err: any) {
                      setAlertModal({
                        isOpen: true,
                        title: t('common.error'),
                        message: err.response?.data?.detail || err.message || 'Failed to update budget',
                        type: 'error',
                      });
                    } finally {
                      setUpdatingBudget(false);
                    }
                  }}
                  disabled={updatingBudget}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-violet-600/90 to-purple-600/90 text-white rounded-lg hover:shadow-lg hover:shadow-violet-500/30 transition-all disabled:opacity-50"
                >
                  {updatingBudget ? t('settings.saving') : t('spending.budget')}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Add Spending Modal */}
      <AnimatePresence>
        {showAddSpending && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddSpending(false)}
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
                className="bg-slate-900/95 backdrop-blur-2xl rounded-2xl border border-orange-500/20 shadow-2xl w-full max-w-md"
              >
                <div className="flex items-center justify-between p-6 border-b border-orange-500/20">
                  <h2 className="text-2xl font-bold text-white">{t('spending.addSpendingEntry')}</h2>
                  <button
                    onClick={() => setShowAddSpending(false)}
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
                      const amount = parseFloat(spendingForm.amount);
                      if (isNaN(amount) || amount <= 0) {
                        throw new Error('Please enter a valid amount greater than 0');
                      }
                      
                      // Save to database
                      await transactionsAPI.createTransaction({
                        amount: amount,
                        type: 'expense',
                        description: spendingForm.description.trim() || 'Expense',
                        category: spendingForm.category,
                        source: 'manual',
                        transaction_date: new Date(spendingForm.date).toISOString(),
                      });
                      
                      // Refresh shared transactions - this will update all pages automatically
                      await refreshTransactions();
                      
                      setShowAddSpending(false);
                      setSpendingForm({
                        amount: '',
                        description: '',
                        category: 'Other',
                        date: new Date().toISOString().split('T')[0],
                      });
                      
                      // Show success message
                      setAlertModal({
                        isOpen: true,
                        title: t('common.success'),
                        message: t('spending.spendingAdded'),
                        type: 'success',
                      });
                      
                    } catch (err: any) {
                      console.error('Error saving spending:', err);
                      const errorMessage = err.response?.data?.detail || err.message || 'Failed to add spending. Please try again.';
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
                      {t('spending.amount')} (₹)
                    </label>
                    <input
                      type="number"
                      required
                      value={spendingForm.amount}
                      onChange={(e) => setSpendingForm({ ...spendingForm, amount: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-orange-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
                      placeholder={t('spending.enterAmount')}
                      min="1"
                      step="0.01"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      {t('spending.description')}
                    </label>
                    <input
                      type="text"
                      required
                      value={spendingForm.description}
                      onChange={(e) => setSpendingForm({ ...spendingForm, description: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-orange-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
                      placeholder={t('spending.enterDescription')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      {t('spending.category')}
                    </label>
                    <select
                      value={spendingForm.category}
                      onChange={(e) => setSpendingForm({ ...spendingForm, category: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-orange-500/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
                    >
                      {spendingCategories.map((cat) => (
                        <option key={cat.value} value={cat.value} className="bg-slate-900">
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      {t('spending.date')}
                    </label>
                    <input
                      type="date"
                      required
                      value={spendingForm.date}
                      onChange={(e) => setSpendingForm({ ...spendingForm, date: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-orange-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
                    />
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowAddSpending(false)}
                      className="flex-1 px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-orange-500/20 rounded-xl text-white hover:bg-white/10 transition-all"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-600/90 to-red-600/90 text-white rounded-xl hover:shadow-lg hover:shadow-orange-500/30 backdrop-blur-sm border border-orange-400/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
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
                        <span>{t('spending.addSpending')}</span>
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

export default SpendingPage;


