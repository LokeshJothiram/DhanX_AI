import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BanknotesIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ShieldCheckIcon,
  PlusIcon,
  ArrowRightIcon,
  WalletIcon,
  SparklesIcon,
  FireIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';
import { goalsAPI, healthScoreAPI } from '../services/api';

interface Transaction {
  id: string;
  type: 'income' | 'expense';
  description: string;
  amount: number;
  date: string;
  category: string;
  formattedDate?: string;
  formattedAmount?: string;
}

const DashboardPage: React.FC = () => {
  const location = useLocation();
  const hasCalculatedRef = useRef(false);
  const { t } = useLanguage();
  const { toasts } = useNotification();
  
  // Use pre-loaded data from DataContext
  const { 
    allTransactions: sharedTransactions, 
    transactionsLoading, 
    refreshTransactions,
    goals: sharedGoals,
    goalsLoading 
  } = useData();
  
  const [stats, setStats] = useState<Array<{
    name: string;
    value: string;
    change: string;
    changeType: 'positive' | 'negative' | 'neutral';
    icon: any;
    gradient: string;
  }>>([
    {
      name: 'Total Balance',
      value: '₹0',
      change: '0%',
      changeType: 'neutral',
      icon: BanknotesIcon,
      gradient: 'from-violet-500 to-purple-500',
    },
    {
      name: 'Allocated Funds',
      value: '₹0',
      change: '0 active goals',
      changeType: 'neutral',
      icon: WalletIcon,
      gradient: 'from-indigo-500 to-blue-500',
    },
    {
      name: 'This Month Income',
      value: '₹0',
      change: '0%',
      changeType: 'neutral',
      icon: ArrowTrendingUpIcon,
      gradient: 'from-green-500 to-emerald-500',
    },
    {
      name: 'This Month Spending',
      value: '₹0',
      change: '0%',
      changeType: 'neutral',
      icon: ChartBarIcon,
      gradient: 'from-orange-500 to-red-500',
    },
    {
      name: 'Emergency Fund',
      value: '₹0',
      change: '0%',
      changeType: 'neutral',
      icon: ShieldCheckIcon,
      gradient: 'from-blue-500 to-cyan-500',
    },
  ]);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [healthScore, setHealthScore] = useState<any>(null);
  const [streaks, setStreaks] = useState<any>(null);
  const [healthScoreLoading, setHealthScoreLoading] = useState(false);

  // Recalculate when data is ready (first load or when navigating back)
  useEffect(() => {
    // Use pre-loaded data - no need to fetch separately
    // Wait for both transactions and goals to load, then calculate dashboard stats
    if (!transactionsLoading && !goalsLoading) {
      loadDashboardData();
      hasCalculatedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedTransactions, sharedGoals, transactionsLoading, goalsLoading]);

  // Recalculate when navigating back to dashboard (location change)
  useEffect(() => {
    if (location.pathname === '/dashboard' && hasCalculatedRef.current && !transactionsLoading && !goalsLoading) {
      loadDashboardData();
    }
  }, [location.pathname, sharedTransactions, sharedGoals, transactionsLoading, goalsLoading]);

  // Load health score and streaks
  useEffect(() => {
    const loadHealthData = async () => {
      if (location.pathname === '/dashboard' && !transactionsLoading && !goalsLoading) {
        setHealthScoreLoading(true);
        try {
          const [scoreData, streaksData] = await Promise.all([
            healthScoreAPI.getHealthScore(),
            healthScoreAPI.getStreaks()
          ]);
          setHealthScore(scoreData);
          setStreaks(streaksData);
        } catch (error: any) {
          console.error('Error loading health data:', error);
          // Set default values on error so UI doesn't break
          if (error.response?.status !== 404) {
            // Only log if it's not a "no data" error
            console.error('Health score API error:', error.response?.data || error.message);
          }
        } finally {
          setHealthScoreLoading(false);
        }
      }
    };
    loadHealthData();
  }, [location.pathname, transactionsLoading, goalsLoading]);

  const loadDashboardData = () => {
    try {
      
      // Use pre-loaded goals and transactions from context - no API calls needed
      const goals = sharedGoals;
      const allTransactions: Transaction[] = sharedTransactions;

      // Calculate stats - optimized single pass calculation
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

      // Single pass calculation for better performance
      let totalIncome = 0;
      let totalExpenses = 0;
      let currentMonthIncome = 0;
      let currentMonthSpending = 0;
      let lastMonthIncome = 0;
      let lastMonthSpending = 0;

      for (const txn of allTransactions) {
        const txnDate = new Date(txn.date);
        const txnMonth = txnDate.getMonth();
        const txnYear = txnDate.getFullYear();
        
        if (txn.type === 'income') {
          totalIncome += txn.amount;
          if (txnMonth === currentMonth && txnYear === currentYear) {
            currentMonthIncome += txn.amount;
          } else if (txnMonth === lastMonth && txnYear === lastMonthYear) {
            lastMonthIncome += txn.amount;
          }
        } else {
          totalExpenses += txn.amount;
          if (txnMonth === currentMonth && txnYear === currentYear) {
            currentMonthSpending += txn.amount;
          } else if (txnMonth === lastMonth && txnYear === lastMonthYear) {
            lastMonthSpending += txn.amount;
          }
        }
      }

      // Calculate total allocated to goals (money saved in goals)
      // Filter out duplicates by ID and only count valid goals
      const uniqueGoals = goals.filter((goal: any, index: number, self: any[]) => 
        goal && goal.id && self.findIndex((g: any) => g.id === goal.id) === index
      );
      
      // Active (in-progress) goals
      const activeGoals = uniqueGoals.filter((goal: any) => goal.is_completed !== true);
      const activeGoalsCount = activeGoals.length;
      
      // Total allocated should only consider active goals
      const totalAllocatedToGoals = activeGoals.reduce((sum: number, goal: any) => {
        return sum + Number(goal.saved || 0);
      }, 0);
      
      // Debug logging (can be removed in production)
      if (process.env.NODE_ENV === 'development') {
        console.log('Dashboard Goals Debug:', {
          totalGoals: goals.length,
          uniqueGoals: uniqueGoals.length,
          activeGoals: activeGoals.length,
          activeGoalsCount,
          goals: activeGoals.map((g: any) => ({
            id: g.id,
            name: g.name,
            is_completed: g.is_completed,
            saved: g.saved
          }))
        });
      }

      // Calculate balance metrics
      // Net Income = Income - Expenses (money you actually earned/have)
      const netIncome = totalIncome - totalExpenses;
      
      // Available Cash = Net Income - Allocated to Goals (money available for spending)
      // This represents money you can actually spend right now
      const availableCash = netIncome - totalAllocatedToGoals;
      
      // Show Available Cash as the main balance metric
      // This is what users care about - money they can actually use
      const totalBalance = availableCash;
      
      // Log warning if negative (data inconsistency)
      if (availableCash < 0) {
        console.warn(`[Dashboard] Available cash is negative (${availableCash}). Net income: ${netIncome}, Allocated: ${totalAllocatedToGoals}. This indicates allocated funds exceed net income.`);
      }

      // Calculate emergency fund from active goals only
      const emergencyGoals = activeGoals.filter((g: any) => g.type === 'emergency');
      const emergencyFund = emergencyGoals.reduce((sum: number, goal: any) => sum + Number(goal.saved || 0), 0);
      const emergencyTarget = emergencyGoals.reduce((sum: number, goal: any) => sum + Number(goal.target || 0), 0);
      const emergencyProgress = emergencyTarget > 0 ? Math.round((emergencyFund / emergencyTarget) * 100) : 0;

      // Calculate percentage changes
      const incomeChange = lastMonthIncome > 0 
        ? ((currentMonthIncome - lastMonthIncome) / lastMonthIncome) * 100 
        : 0;
      
      const spendingChange = lastMonthSpending > 0 
        ? ((currentMonthSpending - lastMonthSpending) / lastMonthSpending) * 100 
        : 0;

      // Update stats
      const changeText = totalBalance >= 0 
        ? `Net: ₹${netIncome.toLocaleString('en-IN')}` 
        : `Over-allocated by ₹${Math.abs(totalBalance).toLocaleString('en-IN')}`;
      
      setStats([
        {
          name: 'Available Cash',
          value: `₹${totalBalance.toLocaleString('en-IN')}`,
          change: changeText,
          changeType: totalBalance >= 0 ? 'positive' : 'negative',
          icon: BanknotesIcon,
          gradient: 'from-violet-500 to-purple-500',
        },
        {
          name: t('dashboard.allocatedFunds'),
          value: `₹${totalAllocatedToGoals.toLocaleString('en-IN')}`,
          change: activeGoalsCount > 0 ? `${activeGoalsCount} ${t('dashboard.activeGoalsLabel')}` : t('dashboard.noActiveGoalsLabel'),
          changeType: 'neutral',
          icon: WalletIcon,
          gradient: 'from-indigo-500 to-blue-500',
        },
        {
          name: t('dashboard.thisMonthIncome'),
          value: `₹${currentMonthIncome.toLocaleString('en-IN')}`,
          change: `${incomeChange >= 0 ? '+' : ''}${incomeChange.toFixed(1)}%`,
          changeType: incomeChange >= 0 ? 'positive' : 'negative',
          icon: ArrowTrendingUpIcon,
          gradient: 'from-green-500 to-emerald-500',
        },
        {
          name: t('dashboard.thisMonthSpending'),
          value: `₹${currentMonthSpending.toLocaleString('en-IN')}`,
          change: `${spendingChange >= 0 ? '+' : ''}${spendingChange.toFixed(1)}%`,
          changeType: spendingChange <= 0 ? 'positive' : 'negative', // Lower spending is positive
          icon: ChartBarIcon,
          gradient: 'from-orange-500 to-red-500',
        },
        {
          name: t('dashboard.emergencyFund'),
          value: `₹${emergencyFund.toLocaleString('en-IN')}`,
          change: `${emergencyProgress}%`,
          changeType: 'neutral',
          icon: ShieldCheckIcon,
          gradient: 'from-blue-500 to-cyan-500',
        },
      ]);

      // Get recent transactions (last 5)
      const recent = allTransactions.slice(0, 5).map((txn) => ({
        ...txn,
        formattedDate: formatTransactionDate(txn.date),
        formattedAmount: `${txn.type === 'income' ? '+' : '-'}₹${txn.amount.toLocaleString('en-IN')}`,
      }));
      
      setRecentTransactions(recent);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    }
  };

  const mapDescriptionToCategory = (description: string): string => {
    const desc = description.toLowerCase();
    if (desc.includes('food') || desc.includes('grocery') || desc.includes('restaurant') || desc.includes('meal')) {
      return 'Food';
    }
    if (desc.includes('fuel') || desc.includes('transport') || desc.includes('uber') || desc.includes('taxi') || desc.includes('ride')) {
      return 'Transport';
    }
    if (desc.includes('bill') || desc.includes('recharge') || desc.includes('internet') || desc.includes('electricity')) {
      return 'Bills';
    }
    if (desc.includes('medicine') || desc.includes('health') || desc.includes('hospital')) {
      return 'Health';
    }
    if (desc.includes('delivery') || desc.includes('swiggy') || desc.includes('zomato')) {
      return 'Gig Work';
    }
    return 'Other';
  };

  const formatTransactionDate = (dateString: string): string => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return t('common.today');
    } else if (date.toDateString() === yesterday.toDateString()) {
      return t('common.yesterday');
    } else {
      const diffTime = today.getTime() - date.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays < 7) {
        return `${diffDays} ${t('common.daysAgo')}`;
      }
      return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }
  };

  // Spending by Category Chart Component
  const SpendingByCategoryChart: React.FC<{ transactions: Transaction[] }> = ({ transactions }) => {
    // Calculate spending by category
    const categorySpending = transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => {
        const category = t.category || 'Other';
        acc[category] = (acc[category] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>);

    const categories = Object.entries(categorySpending)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6); // Top 6 categories

    const total = categories.reduce((sum, cat) => sum + cat.amount, 0);
    const topCategory = categories[0];
    const avgPerCategory = categories.length > 0 ? total / categories.length : 0;

    if (categories.length === 0) {
      return (
        <div className="h-full min-h-[400px] flex items-center justify-center bg-white/5 backdrop-blur-sm rounded-lg border border-violet-500/20">
          <p className="text-white/50">No spending data available</p>
        </div>
      );
    }

    const colors = [
      { gradient: 'from-violet-500 to-purple-500', solid: '#8b5cf6', light: '#a855f7' },
      { gradient: 'from-orange-500 to-red-500', solid: '#f97316', light: '#ef4444' },
      { gradient: 'from-green-500 to-emerald-500', solid: '#10b981', light: '#34d399' },
      { gradient: 'from-blue-500 to-cyan-500', solid: '#3b82f6', light: '#06b6d4' },
      { gradient: 'from-pink-500 to-rose-500', solid: '#ec4899', light: '#f43f5e' },
      { gradient: 'from-yellow-500 to-amber-500', solid: '#eab308', light: '#fbbf24' },
    ];

    return (
      <div className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-violet-500/20">
            <p className="text-xs text-white/60 mb-1">Total Spending</p>
            <p className="text-xl font-bold text-white">₹{total.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-violet-500/20">
            <p className="text-xs text-white/60 mb-1">Top Category</p>
            <p className="text-sm font-semibold text-white truncate">{topCategory?.name || 'N/A'}</p>
            <p className="text-xs text-white/60">₹{topCategory?.amount.toLocaleString('en-IN') || '0'}</p>
          </div>
        </div>

        {/* Larger Donut Chart */}
        <div className="relative w-full h-56 flex items-center justify-center">
          <svg width="220" height="220" className="transform -rotate-90" viewBox="0 0 220 220">
            <circle
              cx="110"
              cy="110"
              r="85"
              fill="none"
              stroke="rgba(255, 255, 255, 0.1)"
              strokeWidth="24"
            />
            {categories.map((cat, index) => {
              const percentage = (cat.amount / total) * 100;
              const offset = categories.slice(0, index).reduce((sum, c) => sum + (c.amount / total) * 100, 0);
              const circumference = 2 * Math.PI * 85;
              const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;
              const strokeDashoffset = -(offset / 100) * circumference;
              
              return (
                <circle
                  key={cat.name}
                  cx="110"
                  cy="110"
                  r="85"
                  fill="none"
                  stroke={`url(#gradient-${index})`}
                  strokeWidth="24"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-500"
                />
              );
            })}
            <defs>
              {colors.map((color, index) => (
                <linearGradient key={index} id={`gradient-${index}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={color.solid} />
                  <stop offset="100%" stopColor={color.light} />
                </linearGradient>
              ))}
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-3xl font-bold text-white">₹{total.toLocaleString('en-IN')}</p>
              <p className="text-xs text-white/60 mt-1">Total Spending</p>
              {topCategory && (
                <p className="text-xs text-white/50 mt-2">
                  {((topCategory.amount / total) * 100).toFixed(1)}% in {topCategory.name}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Category Breakdown with Progress Bars */}
        <div className="space-y-3">
          {categories.map((cat, index) => {
            const percentage = (cat.amount / total) * 100;
            const color = colors[index % colors.length];
            return (
              <div key={cat.name} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${color.gradient}`}></div>
                    <span className="text-sm font-medium text-white">{cat.name}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-white/60">{percentage.toFixed(1)}%</span>
                    <span className="text-sm font-semibold text-white">₹{cat.amount.toLocaleString('en-IN')}</span>
                  </div>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${color.gradient} rounded-full transition-all duration-500`}
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Monthly Trend Chart Component
  const MonthlyTrendChart: React.FC<{ transactions: Transaction[] }> = ({ transactions }) => {
    // Get last 6 months of data
    const months: Array<{ month: string; income: number; spending: number }> = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      months.push({ month: monthKey, income: 0, spending: 0 });
    }

    transactions.forEach(txn => {
      const txnDate = new Date(txn.date);
      const monthIndex = months.findIndex(m => {
        const [month, year] = m.month.split(' ');
        const monthDate = new Date(`${month} 1, ${year}`);
        return txnDate.getMonth() === monthDate.getMonth() &&
               txnDate.getFullYear() === parseInt(year);
      });
      
      if (monthIndex !== -1) {
        if (txn.type === 'income') {
          months[monthIndex].income += txn.amount;
        } else {
          months[monthIndex].spending += txn.amount;
        }
      }
    });

    const maxValue = Math.max(
      ...months.map(m => Math.max(m.income, m.spending)),
      1000 // Minimum scale
    );

    const chartHeight = 200;

    if (months.every(m => m.income === 0 && m.spending === 0)) {
      return (
        <div className="h-64 flex items-center justify-center bg-white/5 backdrop-blur-sm rounded-lg border border-violet-500/20">
          <p className="text-white/50">No data available for the last 6 months</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-end justify-between h-64 px-4 pb-8 bg-white/5 backdrop-blur-sm rounded-lg border border-violet-500/20">
          {months.map((month, index) => {
            const incomeHeight = (month.income / maxValue) * (chartHeight - 40);
            const spendingHeight = (month.spending / maxValue) * (chartHeight - 40);
            const barWidth = 12;
            
            return (
              <div key={index} className="flex flex-col items-center space-y-1 flex-1">
                <div className="relative w-full flex items-end justify-center space-x-1" style={{ height: `${chartHeight - 40}px` }}>
                  {/* Income bar */}
                  <div
                    className="bg-gradient-to-t from-green-500 to-emerald-400 rounded-t transition-all duration-500 hover:opacity-80"
                    style={{
                      width: `${barWidth}px`,
                      height: `${incomeHeight}px`,
                      minHeight: incomeHeight > 0 ? '4px' : '0',
                    }}
                    title={`Income: ₹${month.income.toLocaleString('en-IN')}`}
                  />
                  {/* Spending bar */}
                  <div
                    className="bg-gradient-to-t from-red-500 to-orange-400 rounded-t transition-all duration-500 hover:opacity-80"
                    style={{
                      width: `${barWidth}px`,
                      height: `${spendingHeight}px`,
                      minHeight: spendingHeight > 0 ? '4px' : '0',
                    }}
                    title={`Spending: ₹${month.spending.toLocaleString('en-IN')}`}
                  />
                </div>
                <p className="text-xs text-white/60 mt-2 text-center">
                  {month.month.split(' ')[0]}
                </p>
              </div>
            );
          })}
        </div>
        
        {/* Legend */}
        <div className="flex items-center justify-center space-x-6">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-gradient-to-r from-green-500 to-emerald-400"></div>
            <span className="text-sm text-white/80">Income</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-gradient-to-r from-red-500 to-orange-400"></div>
            <span className="text-sm text-white/80">Spending</span>
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
    <div className="space-y-6 relative z-10">
      {/* Welcome Section */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-slate-900/40 backdrop-blur-2xl rounded-2xl p-6 border border-violet-500/20 shadow-xl shadow-violet-500/10"
      >
        <h1 className="text-3xl font-bold text-white mb-2">
          {t('dashboard.welcomeBack')}
        </h1>
        <p className="text-white/70">
          {t('dashboard.financialOverview')}
        </p>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
        {transactionsLoading || goalsLoading ? (
          // Loading skeleton
          Array.from({ length: stats.length }).map((_, index) => (
            <div
              key={index}
              className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-4 lg:p-5 border border-violet-500/20 animate-pulse"
            >
              <div className="h-10 bg-white/10 rounded mb-3"></div>
              <div className="h-5 bg-white/10 rounded mb-2"></div>
              <div className="h-7 bg-white/10 rounded"></div>
            </div>
          ))
        ) : (
          stats.map((stat, index) => (
            <motion.div
              key={stat.name}
              initial="hidden"
              animate="visible"
              variants={fadeInUp}
              transition={{ delay: index * 0.1 }}
              className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-4 lg:p-5 border border-violet-500/20 hover:border-violet-400/30 transition-all hover:shadow-xl hover:shadow-violet-500/20 group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 lg:p-2.5 rounded-xl bg-gradient-to-br ${stat.gradient} bg-opacity-20 backdrop-blur-sm border border-white/10 group-hover:scale-110 transition-transform`}>
                  <stat.icon className="h-5 w-5 lg:h-6 lg:w-6 text-white" />
                </div>
                <span
                  className={`text-xs lg:text-sm font-medium ${
                    stat.changeType === 'positive'
                      ? 'text-green-400'
                      : stat.changeType === 'negative'
                      ? 'text-red-400'
                      : 'text-white/60'
                  }`}
                >
                  {stat.change}
                </span>
              </div>
              <h3 className="text-xs lg:text-sm font-medium text-white/60 mb-1 line-clamp-2">{stat.name}</h3>
              <p className="text-xl lg:text-2xl font-bold text-white truncate">{stat.value}</p>
            </motion.div>
          ))
        )}
      </div>

      {/* Financial Health Score & Streaks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Financial Health Score */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-green-600/30 to-emerald-600/30 backdrop-blur-sm border border-green-400/30">
                <ShieldCheckIcon className="h-6 w-6 text-green-300" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Financial Health Score</h2>
                <p className="text-xs text-white/60">Your overall financial wellness</p>
              </div>
            </div>
          </div>
          
          {healthScoreLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-pulse text-white/50">Loading...</div>
            </div>
          ) : healthScore && typeof healthScore.score === 'number' ? (
            <div className="space-y-4">
              {/* Score Display */}
              <div className="flex items-center justify-center">
                <div className="relative w-48 h-48">
                  <svg className="transform -rotate-90 w-48 h-48">
                    <circle
                      cx="96"
                      cy="96"
                      r="80"
                      stroke="rgba(255, 255, 255, 0.1)"
                      strokeWidth="12"
                      fill="none"
                    />
                    <circle
                      cx="96"
                      cy="96"
                      r="80"
                      stroke={healthScore.score >= 70 ? "url(#healthGradient)" : healthScore.score >= 50 ? "#f59e0b" : "#ef4444"}
                      strokeWidth="12"
                      fill="none"
                      strokeDasharray={`${(healthScore.score / 100) * 502.4} 502.4`}
                      strokeLinecap="round"
                      className="transition-all duration-1000"
                    />
                    <defs>
                      <linearGradient id="healthGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#34d399" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-5xl font-bold text-white">{healthScore.score}</div>
                    <div className={`text-lg font-semibold ${
                      healthScore.grade === 'A+' || healthScore.grade === 'A' ? 'text-green-400' :
                      healthScore.grade === 'B+' || healthScore.grade === 'B' ? 'text-yellow-400' :
                      healthScore.grade === 'C+' || healthScore.grade === 'C' ? 'text-orange-400' :
                      'text-red-400'
                    }`}>
                      Grade {healthScore.grade}
                    </div>
                  </div>
                </div>
              </div>

              {/* Breakdown */}
              {healthScore.breakdown && (
                <div className="space-y-2">
                  {Object.entries(healthScore.breakdown).map(([key, value]: [string, any]) => (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/80 capitalize">{key.replace('_', ' ')}</span>
                        <span className="text-white font-semibold">{value.score?.toFixed(1) || 0}/{value.max_score || 0}</span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all duration-500"
                          style={{ width: `${((value.score || 0) / (value.max_score || 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recommendations */}
              {healthScore.recommendations && healthScore.recommendations.length > 0 && (
                <div className="mt-4 p-3 bg-violet-500/10 rounded-lg border border-violet-500/20">
                  <p className="text-xs font-semibold text-violet-300 mb-2">💡 Recommendations:</p>
                  <ul className="space-y-1">
                    {healthScore.recommendations.map((rec: string, idx: number) => (
                      <li key={idx} className="text-xs text-white/70">• {rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-white/60">Start tracking your finances to get a health score</p>
            </div>
          )}
        </motion.div>

        {/* Streaks */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-orange-600/30 to-red-600/30 backdrop-blur-sm border border-orange-400/30">
                <FireIcon className="h-6 w-6 text-orange-300" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Your Streaks</h2>
                <p className="text-xs text-white/60">Build consistent financial habits</p>
              </div>
            </div>
          </div>
          
          {healthScoreLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-pulse text-white/50">Loading...</div>
            </div>
          ) : streaks && streaks.savings_streak ? (
            <div className="space-y-4">
              {/* Savings Streak */}
              <div className="p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/20">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <TrophyIcon className="h-5 w-5 text-green-400" />
                    <span className="text-sm font-semibold text-white">Savings Streak</span>
                  </div>
                  {streaks.savings_streak.is_active && (
                    <span className="text-xs text-green-400 font-bold">🔥 ACTIVE</span>
                  )}
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-bold text-white">{streaks.savings_streak.current}</span>
                  <span className="text-sm text-white/60">days</span>
                </div>
                <p className="text-xs text-white/50 mt-1">
                  Best: {streaks.savings_streak.longest} days • Total: {streaks.savings_streak.total_days} days
                </p>
                {!streaks.savings_streak.is_active && streaks.savings_streak.current === 0 && (
                  <p className="text-xs text-orange-400 mt-2">💡 Save money today to start your streak!</p>
                )}
              </div>

              {/* Transaction Streak */}
              <div className="p-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-lg border border-blue-500/20">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <ChartBarIcon className="h-5 w-5 text-blue-400" />
                    <span className="text-sm font-semibold text-white">Tracking Streak</span>
                  </div>
                  {streaks.transaction_streak.is_active && (
                    <span className="text-xs text-blue-400 font-bold">🔥 ACTIVE</span>
                  )}
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-bold text-white">{streaks.transaction_streak.current}</span>
                  <span className="text-sm text-white/60">days</span>
                </div>
                <p className="text-xs text-white/50 mt-1">
                  Best: {streaks.transaction_streak.longest} days • Total: {streaks.transaction_streak.total_days} days
                </p>
                {!streaks.transaction_streak.is_active && streaks.transaction_streak.current === 0 && (
                  <p className="text-xs text-orange-400 mt-2">💡 Log a transaction today to start tracking!</p>
                )}
              </div>

              {/* Summary */}
              <div className="p-3 bg-white/5 rounded-lg border border-violet-500/20">
                <p className="text-xs text-white/60 mb-1">Total Savings Days</p>
                <p className="text-lg font-bold text-white">{streaks.summary.total_savings_days} days</p>
                <p className="text-xs text-white/60 mt-2 mb-1">Total Tracking Days</p>
                <p className="text-lg font-bold text-white">{streaks.summary.total_tracking_days} days</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-white/60">Start saving and tracking to build streaks!</p>
            </div>
          )}
        </motion.div>
      </div>

      {/* Agent Activity Card */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-600/30 to-purple-600/30 backdrop-blur-sm border border-violet-400/30">
              <SparklesIcon className="h-6 w-6 text-violet-300" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">🤖 AI Agent Activity</h2>
              <p className="text-xs text-white/60">Autonomous actions taken today</p>
            </div>
          </div>
        </div>
        
        <div className="space-y-3">
          {/* Calculate agent activity - only show RECENT actions (last 24 hours) */}
          {(() => {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            
            // Filter goals created or updated in last 24 hours
            const recentGoals = sharedGoals.filter((g: any) => {
              if (!g.created_at) return false;
              const createdDate = new Date(g.created_at);
              const updatedDate = g.updated_at ? new Date(g.updated_at) : createdDate;
              // Check if created or updated in last 24 hours
              return createdDate >= yesterday || updatedDate >= yesterday;
            });
            
            const activeGoals = sharedGoals.filter((g: any) => !g.is_completed);
            const emergencyGoals = activeGoals.filter((g: any) => g.type === 'emergency');
            
            const activities = [];
            
            // Check for recently created goals (last 24 hours)
            const recentlyCreatedGoals = recentGoals.filter((g: any) => {
              const createdDate = new Date(g.created_at);
              return createdDate >= yesterday;
            });
            
            if (recentlyCreatedGoals.length > 0) {
              const nonEmergencyRecent = recentlyCreatedGoals.filter((g: any) => g.type !== 'emergency');
              const emergencyRecent = recentlyCreatedGoals.filter((g: any) => g.type === 'emergency');
              const totalRecent = recentlyCreatedGoals.length;
              
              if (totalRecent > 0) {
                const timeAgo = (() => {
                  const newest = Math.max(...recentlyCreatedGoals.map((g: any) => new Date(g.created_at).getTime()));
                  const minutesAgo = Math.floor((now.getTime() - newest) / 60000);
                  if (minutesAgo < 1) return 'Just now';
                  if (minutesAgo < 60) return `${minutesAgo}m ago`;
                  const hoursAgo = Math.floor(minutesAgo / 60);
                  return `${hoursAgo}h ago`;
                })();
                
                activities.push({
                  icon: '🎯',
                  text: `Created ${totalRecent} goal${totalRecent > 1 ? 's' : ''} automatically`,
                  time: timeAgo,
                  priority: 1
                });
              }
            }
            
            // Check for recently updated goals (allocations in last 24 hours)
            const recentlyUpdatedGoals = recentGoals.filter((g: any) => {
              if (!g.updated_at) return false;
              const updatedDate = new Date(g.updated_at);
              const createdDate = new Date(g.created_at);
              // Only count if updated AFTER creation (means allocation happened)
              return updatedDate >= yesterday && updatedDate > createdDate && Number(g.saved || 0) > 0;
            });
            
            if (recentlyUpdatedGoals.length > 0) {
              const totalAllocated = recentlyUpdatedGoals.reduce((sum: number, g: any) => sum + Number(g.saved || 0), 0);
              const timeAgo = (() => {
                const newest = Math.max(...recentlyUpdatedGoals.map((g: any) => new Date(g.updated_at).getTime()));
                const minutesAgo = Math.floor((now.getTime() - newest) / 60000);
                if (minutesAgo < 1) return 'Just now';
                if (minutesAgo < 60) return `${minutesAgo}m ago`;
                const hoursAgo = Math.floor(minutesAgo / 60);
                return `${hoursAgo}h ago`;
              })();
              
              activities.push({
                icon: '💰',
                text: `Auto-allocated ₹${totalAllocated.toLocaleString('en-IN')} to ${recentlyUpdatedGoals.length} goal${recentlyUpdatedGoals.length > 1 ? 's' : ''}`,
                time: timeAgo,
                priority: 2
              });
            }
            
            // Check for emergency fund target set recently
            const recentEmergency = emergencyGoals.filter((g: any) => {
              const createdDate = new Date(g.created_at);
              return createdDate >= yesterday;
            });
            
            if (recentEmergency.length > 0 && recentEmergency[0].target > 0) {
              const timeAgo = (() => {
                const createdDate = new Date(recentEmergency[0].created_at);
                const minutesAgo = Math.floor((now.getTime() - createdDate.getTime()) / 60000);
                if (minutesAgo < 1) return 'Just now';
                if (minutesAgo < 60) return `${minutesAgo}m ago`;
                const hoursAgo = Math.floor(minutesAgo / 60);
                return `${hoursAgo}h ago`;
              })();
              
              activities.push({
                icon: '🛡️',
                text: `Emergency fund target set: ₹${recentEmergency[0].target.toLocaleString('en-IN')}`,
                time: timeAgo,
                priority: 3
              });
            }
            
            // Sort by priority (most recent first)
            activities.sort((a, b) => a.priority - b.priority);
            
            if (activities.length === 0) {
              return (
                <div className="text-center py-4">
                  <p className="text-sm text-white/60">No recent agent actions. Connect an account or add income to see AI in action!</p>
                </div>
              );
            }
            
            return (
              <>
                {activities.slice(0, 3).map((activity, index) => (
                  <div key={index} className="flex items-center space-x-3 p-3 bg-violet-500/10 backdrop-blur-sm rounded-lg border border-violet-500/30 hover:border-violet-400/40 transition-all">
                    <span className="text-2xl">{activity.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm text-white font-medium">{activity.text}</p>
                      <p className="text-xs text-white/50">{activity.time}</p>
                    </div>
                  </div>
                ))}
                {activities.length > 3 && (
                  <p className="text-xs text-center text-white/60 pt-2">
                    +{activities.length - 3} more action{activities.length - 3 > 1 ? 's' : ''}
                  </p>
                )}
              </>
            );
          })()}
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
      >
        <h2 className="text-xl font-bold text-white mb-4">{t('dashboard.quickActions')}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            to="/income"
            className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-violet-600/20 to-purple-600/20 backdrop-blur-xl rounded-xl border border-violet-500/30 hover:border-violet-400/50 transition-all hover:scale-105 hover:shadow-lg hover:shadow-violet-500/20"
          >
            <PlusIcon className="h-6 w-6 text-violet-300 mb-2" />
            <span className="text-sm font-medium text-white">{t('dashboard.addIncome')}</span>
          </Link>
          <Link
            to="/spending"
            className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-orange-600/20 to-red-600/20 backdrop-blur-xl rounded-xl border border-orange-500/30 hover:border-orange-400/50 transition-all hover:scale-105 hover:shadow-lg hover:shadow-orange-500/20"
          >
            <PlusIcon className="h-6 w-6 text-orange-300 mb-2" />
            <span className="text-sm font-medium text-white">{t('dashboard.addExpense')}</span>
          </Link>
          <Link
            to="/goals"
            className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-green-600/20 to-emerald-600/20 backdrop-blur-xl rounded-xl border border-green-500/30 hover:border-green-400/50 transition-all hover:scale-105 hover:shadow-lg hover:shadow-green-500/20"
          >
            <PlusIcon className="h-6 w-6 text-green-300 mb-2" />
            <span className="text-sm font-medium text-white">{t('dashboard.createGoal')}</span>
          </Link>
          <Link
            to="/coach"
            className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-blue-600/20 to-cyan-600/20 backdrop-blur-xl rounded-xl border border-blue-500/30 hover:border-blue-400/50 transition-all hover:scale-105 hover:shadow-lg hover:shadow-blue-500/20"
          >
            <PlusIcon className="h-6 w-6 text-blue-300 mb-2" />
            <span className="text-sm font-medium text-white">{t('common.aiCoach')}</span>
          </Link>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Transactions */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">{t('dashboard.recentTransactions')}</h2>
            <Link
              to="/spending"
              className="text-sm text-violet-400 hover:text-violet-300 flex items-center"
            >
              {t('dashboard.viewAllTransactions')}
              <ArrowRightIcon className="h-4 w-4 ml-1" />
            </Link>
          </div>
          <div className="space-y-3">
            {transactionsLoading ? (
              // Loading skeleton
              Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-white/5 backdrop-blur-sm rounded-lg animate-pulse">
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 bg-white/10 rounded-lg"></div>
                    <div>
                      <div className="h-4 w-32 bg-white/10 rounded mb-2"></div>
                      <div className="h-3 w-24 bg-white/10 rounded"></div>
                    </div>
                  </div>
                  <div className="h-4 w-16 bg-white/10 rounded"></div>
                </div>
              ))
            ) : recentTransactions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-white/60">{t('dashboard.noTransactions')}</p>
                <p className="text-sm text-white/40 mt-2">{t('dashboard.connectPaymentGateway')}</p>
              </div>
            ) : (
              recentTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-3 bg-white/5 backdrop-blur-sm rounded-lg hover:bg-white/10 border border-transparent hover:border-violet-500/20 transition-all"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`p-2 rounded-lg backdrop-blur-sm border ${
                        transaction.type === 'income'
                          ? 'bg-green-500/20 border-green-500/30'
                          : 'bg-red-500/20 border-red-500/30'
                      }`}
                    >
                      {transaction.type === 'income' ? (
                        <ArrowTrendingUpIcon className="h-4 w-4 text-green-400" />
                      ) : (
                        <ChartBarIcon className="h-4 w-4 text-red-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{transaction.description}</p>
                      <p className="text-xs text-white/50">{transaction.category} • {transaction.formattedDate}</p>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      transaction.type === 'income' ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {transaction.formattedAmount}
                  </span>
                </div>
              ))
            )}
          </div>
        </motion.div>

        {/* Spending by Category Chart */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
        >
          <h2 className="text-xl font-bold text-white mb-4">Spending by Category</h2>
          {transactionsLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-pulse text-white/50">Loading chart...</div>
            </div>
          ) : (
            <SpendingByCategoryChart transactions={sharedTransactions} />
          )}
        </motion.div>
      </div>

      {/* Monthly Income vs Spending Chart */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
      >
        <h2 className="text-xl font-bold text-white mb-4">{t('reports.incomeVsSpending')}</h2>
        {transactionsLoading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-pulse text-white/50">Loading chart...</div>
          </div>
        ) : (
          <MonthlyTrendChart transactions={sharedTransactions} />
        )}
      </motion.div>
    </div>
  );
};

export default DashboardPage;

