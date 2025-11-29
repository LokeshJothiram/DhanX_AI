import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChartPieIcon,
  ArrowTrendingUpIcon,
  ShieldCheckIcon,
  BanknotesIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { investmentsAPI } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { useData } from '../context/DataContext';
import AlertModal from '../components/AlertModal';

interface Investment {
  id: string;
  name: string;
  type: string;
  invested_amount: number;
  current_value: number;
  expected_returns?: string;
  risk_level?: string;
  min_investment?: number;
  description?: string;
  icon?: string;
  created_at: string;
  updated_at?: string;
}

// Pre-defined list of available investment funds
const AVAILABLE_FUNDS = [
  {
    name: 'HDFC Equity Fund',
    type: 'mutual_fund',
    risk: 'Moderate',
    returns: '12-15%',
    minInvestment: 500,
    description: 'Diversified equity fund suitable for long-term wealth building',
    icon: ChartPieIcon,
    color: 'from-blue-500 to-cyan-500',
  },
  {
    name: 'SBI Bluechip Fund',
    type: 'mutual_fund',
    risk: 'Low-Moderate',
    returns: '10-12%',
    minInvestment: 1000,
    description: 'Large-cap focused fund with stable returns',
    icon: ChartPieIcon,
    color: 'from-green-500 to-emerald-500',
  },
  {
    name: 'ICICI Prudential Technology Fund',
    type: 'mutual_fund',
    risk: 'High',
    returns: '15-18%',
    minInvestment: 500,
    description: 'Technology sector focused fund for aggressive growth',
    icon: ChartPieIcon,
    color: 'from-purple-500 to-pink-500',
  },
  {
    name: 'Term Life Insurance',
    type: 'insurance',
    risk: 'Low',
    returns: 'Coverage',
    minInvestment: 500,
    description: 'Affordable term insurance for financial security',
    icon: ShieldCheckIcon,
    color: 'from-orange-500 to-red-500',
  },
  {
    name: 'Axis Long Term Equity Fund',
    type: 'mutual_fund',
    risk: 'Moderate',
    returns: '11-14%',
    minInvestment: 500,
    description: 'ELSS fund with tax benefits under Section 80C',
    icon: ChartPieIcon,
    color: 'from-indigo-500 to-blue-500',
  },
  {
    name: 'Fixed Deposit',
    type: 'fd',
    risk: 'Low',
    returns: '6-7%',
    minInvestment: 1000,
    description: 'Safe and secure fixed deposit with guaranteed returns',
    icon: BanknotesIcon,
    color: 'from-green-500 to-teal-500',
  },
];

const InvestmentsPage: React.FC = () => {
  const { t } = useLanguage();
  const { incomeTransactions: sharedIncome } = useData();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFundList, setShowFundList] = useState(false);
  const [selectedFund, setSelectedFund] = useState<typeof AVAILABLE_FUNDS[0] | null>(null);
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [addFundsInvestmentId, setAddFundsInvestmentId] = useState<string | null>(null);
  const [addFundsAmount, setAddFundsAmount] = useState('');
  const [addingFunds, setAddingFunds] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Alert modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    investmentId: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    investmentId: '',
  });

  const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  // Icon mapping
  const getIcon = (type: string) => {
    switch (type) {
      case 'mutual_fund':
        return ChartPieIcon;
      case 'insurance':
        return ShieldCheckIcon;
      case 'stocks':
        return ArrowTrendingUpIcon;
      default:
        return BanknotesIcon;
    }
  };

  const getColor = (type: string, index: number) => {
    const colors = [
      'from-blue-500 to-cyan-500',
      'from-green-500 to-emerald-500',
      'from-purple-500 to-pink-500',
      'from-orange-500 to-red-500',
      'from-indigo-500 to-blue-500',
    ];
    return colors[index % colors.length];
  };

  const loadInvestments = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await investmentsAPI.getInvestments();
      setInvestments(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Error loading investments:', err);
      setError(err.response?.data?.detail || err.message || t('common.failed'));
      setInvestments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvestments();
  }, []);

  // Calculate stats from real investments
  const investmentStats = investments.reduce(
    (acc, inv) => {
      const invested = Number(inv.invested_amount) || 0;
      const current = Number(inv.current_value) || 0;
      acc.totalInvested += invested;
      acc.currentValue += current;
      return acc;
    },
    { totalInvested: 0, currentValue: 0 }
  );

  const profit = investmentStats.currentValue - investmentStats.totalInvested;
  const returns = investmentStats.totalInvested > 0
    ? ((profit / investmentStats.totalInvested) * 100).toFixed(1)
    : 0;

  // Calculate monthly income and investment allocation (20% of income)
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthlyIncome = (sharedIncome || [])
    .filter(item => {
      if (!item || !item.date) return false;
      const itemDate = new Date(item.date);
      if (isNaN(itemDate.getTime())) return false;
      return itemDate.getMonth() === currentMonth && itemDate.getFullYear() === currentYear;
    })
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const availableForInvestment = Math.round(monthlyIncome * 0.2); // 20% of monthly income

  const handleSelectFund = (fund: typeof AVAILABLE_FUNDS[0]) => {
    setSelectedFund(fund);
    setShowFundList(false);
    setShowAddFunds(true);
  };

  const handleAddFundsToNewInvestment = async () => {
    if (!selectedFund) return;
    
    const amountToAdd = parseFloat(addFundsAmount);
    if (isNaN(amountToAdd) || amountToAdd <= 0) {
      setError(t('investments.investmentAmount'));
      return;
    }

    if (amountToAdd < selectedFund.minInvestment) {
      setError(`${t('investments.minInvestment')}: ₹${selectedFund.minInvestment}`);
      return;
    }

    try {
      setAddingFunds(true);
      setError(null);

      // Check if investment already exists
      const existingInvestment = investments.find(
        (inv) => inv.name === selectedFund.name && inv.type === selectedFund.type
      );

      if (existingInvestment) {
        // Add funds to existing investment
        const newInvestedAmount = Number(existingInvestment.invested_amount) + amountToAdd;
        const newCurrentValue = Number(existingInvestment.current_value) + amountToAdd;

        await investmentsAPI.updateInvestment(existingInvestment.id, {
          invested_amount: newInvestedAmount,
          current_value: newCurrentValue,
        });
      } else {
        // Create new investment and add funds
        await investmentsAPI.createInvestment({
          name: selectedFund.name,
          type: selectedFund.type,
          invested_amount: amountToAdd,
          current_value: amountToAdd,
          expected_returns: selectedFund.returns,
          risk_level: selectedFund.risk,
          min_investment: selectedFund.minInvestment,
          description: selectedFund.description,
        });
      }

      setShowAddFunds(false);
      setAddFundsInvestmentId(null);
      setAddFundsAmount('');
      setSelectedFund(null);
      setAddingFunds(false);
      await loadInvestments();
    } catch (err: any) {
      setAddingFunds(false);
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to add investment';
      setError(errorMessage);
      console.error('Error adding investment:', err);
    }
  };

  const handleAddFunds = async (investmentId: string) => {
    const amountToAdd = parseFloat(addFundsAmount);
    if (isNaN(amountToAdd) || amountToAdd <= 0) {
      setError(t('investments.investmentAmount'));
      return;
    }

    try {
      setAddingFunds(true);
      setError(null);
      const investment = investments.find((inv) => inv.id === investmentId);
      if (!investment) {
        setError(t('common.error'));
        return;
      }

      const newInvestedAmount = Number(investment.invested_amount) + amountToAdd;
      const newCurrentValue = Number(investment.current_value) + amountToAdd; // Assume same value initially

      await investmentsAPI.updateInvestment(investmentId, {
        invested_amount: newInvestedAmount,
        current_value: newCurrentValue,
      });

      setShowAddFunds(false);
      setAddFundsInvestmentId(null);
      setAddFundsAmount('');
      setAddingFunds(false);
      await loadInvestments();
    } catch (err: any) {
      setAddingFunds(false);
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to add funds';
      setError(errorMessage);
      console.error('Error adding funds:', err);
    }
  };

  const handleDeleteInvestment = async (investmentId: string) => {
    setConfirmModal({
      isOpen: true,
      title: t('common.delete') || 'Delete Investment',
      message: t('investments.deleteInvestmentConfirm') || 'Are you sure you want to delete this investment?',
      investmentId,
    });
  };

  const confirmDeleteInvestment = async () => {
    const investmentId = confirmModal.investmentId;
    if (!investmentId) return;

    try {
      setError(null);
      await investmentsAPI.deleteInvestment(investmentId);
      await loadInvestments();
      setConfirmModal({ ...confirmModal, isOpen: false });
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to delete investment';
      setError(errorMessage);
      console.error('Error deleting investment:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">{t('investments.title')}</h1>
          <p className="text-white/70">{t('investments.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowFundList(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-violet-600/90 to-purple-600/90 text-white rounded-xl hover:shadow-lg hover:shadow-violet-500/30 backdrop-blur-sm border border-violet-400/30 transition-all"
        >
          <PlusIcon className="h-5 w-5" />
          <span>{t('investments.investNow')}</span>
        </button>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl backdrop-blur-sm"
        >
          <p className="text-sm text-red-400">{error}</p>
        </motion.div>
      )}

      {/* Investment Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 animate-pulse"
            >
              <div className="h-4 bg-white/10 rounded mb-2"></div>
              <div className="h-8 bg-white/10 rounded"></div>
            </div>
          ))
        ) : (
          <>
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl hover:border-violet-400/30 transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/60">{t('investments.totalInvested')}</p>
            <BanknotesIcon className="h-5 w-5 text-violet-400" />
          </div>
          <p className="text-2xl font-bold text-white">₹{investmentStats.totalInvested.toLocaleString()}</p>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          transition={{ delay: 0.1 }}
          className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl hover:border-violet-400/30 transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/60">{t('investments.currentValue')}</p>
            <ChartPieIcon className="h-5 w-5 text-green-400" />
          </div>
          <p className="text-2xl font-bold text-white">₹{investmentStats.currentValue.toLocaleString()}</p>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          transition={{ delay: 0.2 }}
          className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl hover:border-violet-400/30 transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/60">{t('investments.returns')}</p>
            <ArrowTrendingUpIcon className="h-5 w-5 text-green-400" />
          </div>
          <p className={`text-2xl font-bold ${Number(returns) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {Number(returns) >= 0 ? '+' : ''}{returns}%
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          transition={{ delay: 0.3 }}
          className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl hover:border-violet-400/30 transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/60">{t('investments.profitLoss')}</p>
            <ArrowTrendingUpIcon className="h-5 w-5 text-green-400" />
          </div>
          <p className={`text-2xl font-bold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {profit >= 0 ? '+' : ''}₹{profit.toLocaleString()}
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          transition={{ delay: 0.4 }}
          className="bg-gradient-to-br from-emerald-500/20 to-teal-500/20 backdrop-blur-2xl rounded-xl p-6 border border-emerald-500/30 shadow-xl hover:border-emerald-400/50 transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/70">Available for Investment</p>
            <ArrowTrendingUpIcon className="h-5 w-5 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-white">₹{availableForInvestment.toLocaleString()}</p>
          <p className="text-xs text-white/50 mt-1">20% of monthly income (₹{monthlyIncome.toLocaleString()})</p>
        </motion.div>
          </>
        )}
      </div>

      {/* Investments List */}
      {loading ? (
        <div className="space-y-4">
          <div className="h-6 bg-white/10 rounded w-48 animate-pulse"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 animate-pulse"
              >
                <div className="h-6 bg-white/10 rounded mb-4"></div>
                <div className="h-4 bg-white/10 rounded mb-2"></div>
                <div className="h-8 bg-white/10 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      ) : investments.length === 0 ? (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-12 border border-violet-500/20 shadow-xl text-center"
        >
          <BanknotesIcon className="h-16 w-16 text-white/30 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">{t('investments.noInvestments')}</h3>
          <p className="text-white/70 mb-6">{t('investments.startBuildingPortfolio')}</p>
          <button
            onClick={() => setShowFundList(true)}
            className="px-6 py-3 bg-gradient-to-r from-violet-600/90 to-purple-600/90 text-white rounded-xl hover:shadow-lg hover:shadow-violet-500/30 backdrop-blur-sm border border-violet-400/30 transition-all"
          >
            {t('investments.browseInvestmentFunds')}
          </button>
        </motion.div>
      ) : (
        <div>
          <h2 className="text-xl font-bold text-white mb-4">{t('investments.yourInvestments')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {investments.map((investment, index) => {
              const Icon = getIcon(investment.type);
              const color = getColor(investment.type, index);
              const invested = Number(investment.invested_amount) || 0;
              const current = Number(investment.current_value) || 0;
              const invProfit = current - invested;
              const invReturns = invested > 0 ? ((invProfit / invested) * 100).toFixed(1) : 0;

              return (
                <motion.div
                  key={investment.id}
                  initial="hidden"
                  animate="visible"
                  variants={fadeInUp}
                  transition={{ delay: index * 0.1 }}
                  className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl hover:border-violet-400/30 transition-all"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-xl bg-gradient-to-br ${color} bg-opacity-20 backdrop-blur-sm border border-white/10`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs px-2 py-1 bg-white/10 rounded-lg text-white/70">
                        {investment.type.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                      </span>
                      <button
                        onClick={() => handleDeleteInvestment(investment.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{investment.name}</h3>
                  {investment.description && (
                    <p className="text-sm text-white/70 mb-4">{investment.description}</p>
                  )}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/60">{t('investments.totalInvested')}</span>
                      <span className="text-white font-semibold">₹{invested.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/60">{t('investments.currentValue')}</span>
                      <span className="text-white font-semibold">₹{current.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/60">{t('investments.returns')}</span>
                      <span className={`font-semibold ${Number(invReturns) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {Number(invReturns) >= 0 ? '+' : ''}{invReturns}%
                      </span>
                    </div>
                    {investment.risk_level && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/60">{t('investments.risk')}</span>
                        <span className="text-white">{investment.risk_level}</span>
                      </div>
                    )}
                    {investment.expected_returns && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/60">{t('investments.expectedReturns')}</span>
                        <span className="text-green-400 font-semibold">{investment.expected_returns}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setAddFundsInvestmentId(investment.id);
                      setShowAddFunds(true);
                    }}
                    className="w-full py-2 bg-gradient-to-r from-violet-600/90 to-purple-600/90 text-white rounded-lg hover:shadow-lg hover:shadow-violet-500/30 backdrop-blur-sm border border-violet-400/30 transition-all"
                  >
                    {t('investments.addFunds')}
                  </button>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fund List Modal */}
      <AnimatePresence>
        {showFundList && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => setShowFundList(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900/95 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl w-full max-w-4xl my-8"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">{t('investments.chooseInvestmentFund')}</h2>
                <button
                  onClick={() => setShowFundList(false)}
                  className="text-white/70 hover:text-white"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto pr-2">
                {AVAILABLE_FUNDS.map((fund, index) => {
                  const Icon = fund.icon;
                  const isInvested = investments.some(
                    (inv) => inv.name === fund.name && inv.type === fund.type
                  );
                  
                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-5 border border-violet-500/20 hover:border-violet-400/40 transition-all cursor-pointer"
                      onClick={() => handleSelectFund(fund)}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className={`p-3 rounded-xl bg-gradient-to-br ${fund.color} bg-opacity-20 backdrop-blur-sm border border-white/10`}>
                          <Icon className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs px-2 py-1 bg-white/10 rounded-lg text-white/70">
                            {fund.type.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                          </span>
                          {isInvested && (
                            <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded-lg border border-green-500/30">
                              {t('investments.invested')}
                            </span>
                          )}
                        </div>
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">{fund.name}</h3>
                      <p className="text-sm text-white/70 mb-4">{fund.description}</p>
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-white/60">{t('investments.risk')}</span>
                          <span className="text-white">{fund.risk}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-white/60">{t('investments.expectedReturns')}</span>
                          <span className="text-green-400 font-semibold">{fund.returns}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-white/60">{t('investments.minInvestment')}</span>
                          <span className="text-white font-semibold">₹{fund.minInvestment.toLocaleString()}</span>
                        </div>
                      </div>
                      <button className="w-full py-2 bg-gradient-to-r from-violet-600/90 to-purple-600/90 text-white rounded-lg hover:shadow-lg hover:shadow-violet-500/30 backdrop-blur-sm border border-violet-400/30 transition-all">
                        {isInvested ? t('investments.addMoreFunds') : t('investments.investNow')}
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Funds Modal */}
      <AnimatePresence>
        {showAddFunds && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => {
              setShowAddFunds(false);
              setAddFundsInvestmentId(null);
              setAddFundsAmount('');
              setSelectedFund(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900/95 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-white">
                  {selectedFund ? `${t('investments.investIn')} ${selectedFund.name}` : t('investments.addFunds')}
                </h2>
                <button
                  onClick={() => {
                    setShowAddFunds(false);
                    setAddFundsInvestmentId(null);
                    setAddFundsAmount('');
                    setSelectedFund(null);
                  }}
                  className="text-white/70 hover:text-white"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              {selectedFund && (
                <div className="mb-4 p-4 bg-white/5 rounded-lg border border-violet-500/20">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className={`p-2 rounded-lg bg-gradient-to-br ${selectedFund.color} bg-opacity-20`}>
                      <selectedFund.icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">{selectedFund.name}</h3>
                      <p className="text-sm text-white/60">{selectedFund.description}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-white/60">{t('investments.risk')}:</span>
                      <span className="text-white ml-2">{selectedFund.risk}</span>
                    </div>
                    <div>
                      <span className="text-white/60">{t('investments.returns')}:</span>
                      <span className="text-green-400 ml-2">{selectedFund.returns}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-white/60">{t('investments.minInvestment')}:</span>
                      <span className="text-white ml-2">₹{selectedFund.minInvestment.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">{t('investments.investmentAmount')}</label>
                  <input
                    type="number"
                    required
                    min={selectedFund?.minInvestment || 1}
                    step="0.01"
                    value={addFundsAmount}
                    onChange={(e) => setAddFundsAmount(e.target.value)}
                    className="w-full px-4 py-2 bg-white/5 border border-violet-500/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-violet-400/50"
                    placeholder={`${t('investments.min')}: ₹${selectedFund?.minInvestment.toLocaleString() || '1'}`}
                  />
                  {selectedFund && (
                    <p className="text-xs text-white/50 mt-1">
                      {t('investments.minInvestment')}: ₹{selectedFund.minInvestment.toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddFunds(false);
                      setAddFundsInvestmentId(null);
                      setAddFundsAmount('');
                      setSelectedFund(null);
                    }}
                    className="flex-1 px-4 py-2 bg-white/5 border border-violet-500/20 text-white rounded-lg hover:bg-white/10 transition-all"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={selectedFund ? handleAddFundsToNewInvestment : () => addFundsInvestmentId && handleAddFunds(addFundsInvestmentId)}
                    disabled={addingFunds}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-violet-600/90 to-purple-600/90 text-white rounded-lg hover:shadow-lg hover:shadow-violet-500/30 transition-all disabled:opacity-50"
                  >
                    {addingFunds ? t('common.loading') : selectedFund ? t('investments.investNow') : t('investments.addFunds')}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Disclaimer */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl backdrop-blur-sm"
      >
        <p className="text-sm text-white/70">
          <span className="font-semibold">{t('investments.disclaimer')}:</span> {t('investments.disclaimerText')}
        </p>
      </motion.div>

      {/* Confirm Modal */}
      <AlertModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        title={confirmModal.title}
        message={confirmModal.message}
        type="warning"
        confirmText={t('common.confirm')}
        onConfirm={confirmDeleteInvestment}
        showCancel={true}
        cancelText={t('common.cancel')}
      />
    </div>
  );
};

export default InvestmentsPage;
