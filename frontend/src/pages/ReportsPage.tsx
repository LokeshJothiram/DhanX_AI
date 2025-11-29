import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  DocumentChartBarIcon,
  CalendarIcon,
  ArrowDownTrayIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { useLanguage } from '../context/LanguageContext';
import { reportsAPI } from '../services/api';

interface ReportData {
  period: string;
  period_label: string;
  income: number;
  expenses: number;
  savings: number;
  savings_rate: number;
  category_breakdown: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
  transaction_count: number;
}

interface TrendData {
  month: string;
  income: number;
  expenses: number;
  savings: number;
}

const categoryColors: Record<string, string> = {
  'Income': 'from-green-500 to-emerald-500',
  'Food': 'from-orange-500 to-red-500',
  'Transport': 'from-blue-500 to-cyan-500',
  'Bills': 'from-purple-500 to-pink-500',
  'Health': 'from-red-500 to-pink-500',
  'Rent': 'from-indigo-500 to-purple-500',
  'Other': 'from-gray-500 to-slate-500',
};

const ReportsPage: React.FC = () => {
  const { t } = useLanguage();
  const [selectedPeriod, setSelectedPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [trendsData, setTrendsData] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReports = async () => {
    try {
      setLoading(true);
      setError(null);
      const [report, trends] = await Promise.all([
        reportsAPI.getReports(selectedPeriod),
        reportsAPI.getTrends(selectedPeriod),
      ]);
      setReportData(report);
      setTrendsData(trends.trends || []);
    } catch (err: any) {
      console.error('Error loading reports:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to load reports');
      setReportData(null);
      setTrendsData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [selectedPeriod]);

  const getCategoryColor = (category: string): string => {
    return categoryColors[category] || 'from-gray-500 to-slate-500';
  };

  const getReportTitle = (period: string): string => {
    if (period === 'month') return t('reports.monthlyFinancialReport');
    if (period === 'quarter') return t('reports.quarterlyFinancialReport');
    return t('reports.annualFinancialReport');
  };

  const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  // Simple bar chart component for trends
  const TrendChart: React.FC<{ data: TrendData[] }> = ({ data }) => {
    if (data.length === 0) {
      return (
        <div className="h-80 flex items-center justify-center">
          <p className="text-white/50">{t('reports.trendChartPlaceholder')}</p>
        </div>
      );
    }

    const maxValue = Math.max(
      ...data.map(d => Math.max(d.income, d.expenses))
    );

    return (
      <div className="h-80 flex items-end justify-between gap-2">
        {data.map((item, index) => {
          const incomeHeight = (item.income / maxValue) * 100;
          const expensesHeight = (item.expenses / maxValue) * 100;
          
          return (
            <div key={index} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col items-center justify-end h-full gap-1">
                <div
                  className="w-full bg-gradient-to-t from-green-500 to-emerald-500 rounded-t"
                  style={{ height: `${incomeHeight}%`, minHeight: incomeHeight > 0 ? '4px' : '0' }}
                  title={`Income: ₹${item.income.toLocaleString()}`}
                />
                <div
                  className="w-full bg-gradient-to-t from-red-500 to-orange-500 rounded-t"
                  style={{ height: `${expensesHeight}%`, minHeight: expensesHeight > 0 ? '4px' : '0' }}
                  title={`Expenses: ₹${item.expenses.toLocaleString()}`}
                />
              </div>
              <div className="text-xs text-white/60 mt-2 text-center transform -rotate-45 origin-top-left whitespace-nowrap">
                {item.month.split(' ')[0]}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">{t('reports.title')}</h1>
          <p className="text-white/70">{t('reports.subtitle')}</p>
        </div>
        <button 
          onClick={() => {
            // Export functionality can be added later
            alert('Export feature coming soon!');
          }}
          className="mt-4 sm:mt-0 flex items-center space-x-2 px-4 py-2 bg-white/5 backdrop-blur-xl hover:bg-white/10 text-white rounded-xl transition-all border border-violet-500/20 hover:border-violet-400/30"
        >
          <ArrowDownTrayIcon className="h-5 w-5" />
          <span>{t('reports.exportReport')}</span>
        </button>
      </div>

      {/* Period Selector */}
      <div className="flex space-x-2">
        {(['month', 'quarter', 'year'] as const).map((period) => (
          <button
            key={period}
            onClick={() => setSelectedPeriod(period)}
            className={`px-4 py-2 rounded-xl font-medium transition-all backdrop-blur-sm ${
              selectedPeriod === period
                ? 'bg-gradient-to-r from-violet-600/90 to-purple-600/90 text-white shadow-lg shadow-violet-500/20 border border-violet-400/30'
                : 'bg-white/5 text-white/70 hover:bg-white/10 border border-transparent hover:border-violet-500/20'
            }`}
          >
            {t(`reports.${period}`)}
          </button>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Report Card */}
      {loading ? (
        <div className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl animate-pulse">
          <div className="h-6 bg-white/10 rounded mb-4"></div>
          <div className="h-8 bg-white/10 rounded mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-white/10 rounded"></div>
            <div className="h-4 bg-white/10 rounded"></div>
            <div className="h-4 bg-white/10 rounded"></div>
          </div>
        </div>
      ) : reportData ? (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl hover:border-violet-400/30 transition-all"
        >
          <div className="flex items-center justify-between mb-4">
            <DocumentChartBarIcon className="h-6 w-6 text-violet-400" />
            <span className="text-xs px-2 py-1 bg-white/10 backdrop-blur-sm rounded-lg text-white/70 border border-violet-500/20">
              {reportData.period_label}
            </span>
          </div>
          <h3 className="text-lg font-bold text-white mb-4">{getReportTitle(selectedPeriod)}</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">{t('reports.income')}</span>
              <span className="text-sm font-bold text-green-400">₹{reportData.income.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">{t('reports.expenses')}</span>
              <span className="text-sm font-bold text-red-400">₹{reportData.expenses.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">{t('reports.savings')}</span>
              <span className="text-sm font-bold text-white">₹{reportData.savings.toLocaleString()}</span>
            </div>
            <div className="pt-3 border-t border-violet-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-white/60">{t('reports.savingsRate')}</span>
                <span className="text-sm font-bold text-white">{reportData.savings_rate.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full"
                  style={{ width: `${Math.min(reportData.savings_rate, 100)}%` }}
                />
              </div>
            </div>
            <div className="pt-2 text-xs text-white/50">
              {reportData.transaction_count} transactions
            </div>
          </div>
        </motion.div>
      ) : null}

      {/* Income vs Spending Chart */}
      {loading ? (
        <div className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl animate-pulse">
          <div className="h-6 bg-white/10 rounded mb-4"></div>
          <div className="h-80 bg-white/10 rounded"></div>
        </div>
      ) : (
        <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
      >
        <h2 className="text-xl font-bold text-white mb-4">{t('reports.incomeVsSpending')}</h2>
        <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-violet-500/20 p-4">
          <TrendChart data={trendsData} />
          <div className="flex items-center justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gradient-to-r from-green-500 to-emerald-500 rounded"></div>
              <span className="text-sm text-white/70">Income</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gradient-to-r from-red-500 to-orange-500 rounded"></div>
              <span className="text-sm text-white/70">Expenses</span>
            </div>
          </div>
        </div>
      </motion.div>
      )}

      {/* Category Breakdown */}
      {reportData && reportData.category_breakdown.length > 0 && (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
        >
          <h2 className="text-xl font-bold text-white mb-4">{t('reports.categoryBreakdown')}</h2>
          <div className="space-y-4">
            {reportData.category_breakdown.map((item, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <ChartBarIcon className="h-5 w-5 text-white/60" />
                    <span className="font-medium text-white">{item.category}</span>
                  </div>
                  <span className="font-bold text-white">₹{item.amount.toLocaleString()}</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${getCategoryColor(item.category)} rounded-full`}
                    style={{ width: `${Math.min(item.percentage, 100)}%` }}
                  />
                </div>
                <div className="text-xs text-white/50 ml-8">{item.percentage.toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Savings Rate Analysis */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
      >
        <h2 className="text-xl font-bold text-white mb-4">{t('reports.savingsRateAnalysis')}</h2>
        <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-violet-500/20 p-4">
          {trendsData.length > 0 ? (
            <div className="h-64 flex items-end justify-between gap-2">
              {trendsData.map((item, index) => {
                const savingsRate = item.income > 0 ? (item.savings / item.income) * 100 : 0;
                return (
                  <div key={index} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col items-center justify-end h-full">
                      <div
                        className="w-full bg-gradient-to-t from-violet-500 to-purple-500 rounded-t"
                        style={{ 
                          height: `${Math.min(Math.max(savingsRate, 0), 100)}%`,
                          minHeight: savingsRate > 0 ? '4px' : '0'
                        }}
                        title={`Savings Rate: ${savingsRate.toFixed(1)}%`}
                      />
                    </div>
                    <div className="text-xs text-white/60 mt-2 text-center transform -rotate-45 origin-top-left whitespace-nowrap">
                      {item.month.split(' ')[0]}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center">
              <p className="text-white/50">{t('reports.trendChartPlaceholder')}</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default ReportsPage;
