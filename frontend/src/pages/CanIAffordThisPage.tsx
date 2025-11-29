import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  CurrencyRupeeIcon,
  SparklesIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  LightBulbIcon,
} from '@heroicons/react/24/outline';
import { affordabilityAPI } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';

interface AffordabilityResult {
  can_afford: boolean;
  recommendation: 'yes' | 'no' | 'maybe' | 'wait';
  confidence: number;
  reasoning: string;
  financial_impact: {
    available_cash_before: number;
    available_cash_after: number;
    purchase_percentage_of_income: number;
    purchase_percentage_of_available: number;
  };
  suggestions: string[];
}

const CanIAffordThisPage: React.FC = () => {
  const { t } = useLanguage();
  const { showError } = useNotification();
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AffordabilityResult | null>(null);

  const handleAnalyze = async () => {
    const purchaseAmount = parseFloat(amount);
    
    if (!amount || isNaN(purchaseAmount) || purchaseAmount <= 0) {
      showError('Please enter a valid amount');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await affordabilityAPI.analyze({
        amount: purchaseAmount,
        description: description || undefined,
      });
      
      setResult(response);
    } catch (error: any) {
      console.error('Error analyzing affordability:', error);
      showError(
        error.response?.data?.detail || 'Failed to analyze affordability. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const getRecommendationIcon = () => {
    if (!result) return null;
    
    switch (result.recommendation) {
      case 'yes':
        return <CheckCircleIcon className="w-16 h-16 text-green-400" />;
      case 'no':
        return <XCircleIcon className="w-16 h-16 text-red-400" />;
      case 'maybe':
        return <ExclamationTriangleIcon className="w-16 h-16 text-yellow-400" />;
      case 'wait':
        return <ClockIcon className="w-16 h-16 text-orange-400" />;
      default:
        return null;
    }
  };

  const getRecommendationColorClasses = () => {
    if (!result) return { border: 'border-violet-500/20', text: 'text-white', bg: 'bg-violet-500' };
    
    switch (result.recommendation) {
      case 'yes':
        return { border: 'border-green-500/30', text: 'text-green-400', bg: 'bg-green-500' };
      case 'no':
        return { border: 'border-red-500/30', text: 'text-red-400', bg: 'bg-red-500' };
      case 'maybe':
        return { border: 'border-yellow-500/30', text: 'text-yellow-400', bg: 'bg-yellow-500' };
      case 'wait':
        return { border: 'border-orange-500/30', text: 'text-orange-400', bg: 'bg-orange-500' };
      default:
        return { border: 'border-violet-500/20', text: 'text-white', bg: 'bg-violet-500' };
    }
  };

  const getRecommendationText = () => {
    if (!result) return '';
    
    switch (result.recommendation) {
      case 'yes':
        return 'Yes, you can afford this!';
      case 'no':
        return "No, it's not advisable right now";
      case 'maybe':
        return 'Maybe - proceed with caution';
      case 'wait':
        return 'Wait - consider saving first';
      default:
        return '';
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <SparklesIcon className="w-10 h-10 text-violet-400" />
            <h1 className="text-4xl font-bold text-white">
              Can I Afford This?
            </h1>
          </div>
          <p className="text-lg text-white/70">
            Get AI-powered advice on whether you can afford a purchase
          </p>
        </motion.div>

        {/* Main Content - Side by Side Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Input Form and Info */}
          <div className="space-y-6">
            {/* Input Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-slate-900/40 backdrop-blur-2xl rounded-2xl border border-violet-500/20 shadow-xl p-6"
            >
          <div className="space-y-4">
            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-white/90 mb-2">
                Purchase Amount (₹)
              </label>
              <div className="relative">
                <CurrencyRupeeIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/50" />
                <input
                  type="number"
                  id="amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-violet-500/20 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-400/50 text-lg text-white placeholder-white/40"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-white/90 mb-2">
                What do you want to buy? (Optional)
              </label>
              <input
                type="text"
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., New smartphone, Laptop, etc."
                className="w-full px-4 py-3 bg-white/5 border border-violet-500/20 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-400/50 text-white placeholder-white/40"
              />
            </div>

            <button
              onClick={handleAnalyze}
              disabled={loading || !amount}
              className="w-full bg-gradient-to-r from-violet-600/90 via-purple-600/90 to-fuchsia-600/90 text-white py-3 px-6 rounded-lg font-semibold hover:shadow-lg hover:shadow-violet-500/30 backdrop-blur-sm border border-violet-400/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Analyzing...
                </>
              ) : (
                <>
                  <SparklesIcon className="w-5 h-5" />
                  Analyze Purchase
                </>
              )}
            </button>
          </div>
        </motion.div>

        {/* Info Section - Show when no results */}
        {!result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-6"
          >
            <h3 className="text-lg font-semibold text-blue-300 mb-2">
              How it works
            </h3>
            <p className="text-white/70">
              Our AI analyzes your financial situation including your available cash, monthly income, 
              spending patterns, active savings goals, and budget to give you personalized advice on 
              whether you can afford a purchase. The analysis considers multiple factors to ensure 
              you make informed financial decisions.
            </p>
          </motion.div>
        )}

        {/* Suggestions - Show below input form on left side when results are available */}
        {result && result.suggestions && result.suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-slate-900/40 backdrop-blur-2xl rounded-2xl border border-violet-500/20 shadow-xl p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <LightBulbIcon className="w-6 h-6 text-yellow-400" />
              <h3 className="text-xl font-semibold text-white">Suggestions</h3>
            </div>
            <ul className="space-y-2">
              {result.suggestions.map((suggestion, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-yellow-400 mt-1">•</span>
                  <span className="text-white/80">{suggestion}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
          </div>

          {/* Right Column - Results or Placeholder */}
          {!result ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-6"
            >
              {/* Placeholder Design */}
              <div className="bg-slate-900/40 backdrop-blur-2xl rounded-2xl border border-violet-500/20 shadow-xl p-8 h-full flex flex-col items-center justify-center min-h-[400px]">
                <div className="text-center space-y-4">
                  <div className="flex justify-center mb-4">
                    <div className="relative">
                      <SparklesIcon className="w-20 h-20 text-violet-400/50" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-16 h-16 bg-violet-500/20 rounded-full animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-white/90">
                    Ready to Analyze?
                  </h3>
                  <p className="text-white/60 max-w-md">
                    Enter a purchase amount and click "Analyze Purchase" to get AI-powered financial advice based on your complete financial profile.
                  </p>
                  <div className="mt-8 grid grid-cols-2 gap-4 w-full max-w-sm">
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-center">
                      <p className="text-xs text-white/50 mb-1">Available Cash</p>
                      <p className="text-lg font-semibold text-blue-400">--</p>
                    </div>
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4 text-center">
                      <p className="text-xs text-white/50 mb-1">Monthly Income</p>
                      <p className="text-lg font-semibold text-purple-400">--</p>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-center">
                      <p className="text-xs text-white/50 mb-1">Active Goals</p>
                      <p className="text-lg font-semibold text-green-400">--</p>
                    </div>
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 text-center">
                      <p className="text-xs text-white/50 mb-1">Emergency Fund</p>
                      <p className="text-lg font-semibold text-orange-400">--</p>
                    </div>
                  </div>
                  <div className="mt-6 flex items-center justify-center gap-2 text-violet-400/70">
                    <SparklesIcon className="w-5 h-5" />
                    <span className="text-sm">Powered by AI Financial Analysis</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-6"
            >
            {/* Recommendation Card */}
            <div className={`bg-slate-900/40 backdrop-blur-2xl rounded-2xl shadow-xl p-6 border-2 ${getRecommendationColorClasses().border}`}>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  {getRecommendationIcon()}
                </div>
                <div className="flex-1">
                  <h2 className={`text-2xl font-bold ${getRecommendationColorClasses().text} mb-2`}>
                    {getRecommendationText()}
                  </h2>
                  <p className="text-white/70 mb-4">{result.reasoning}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white/60">Confidence:</span>
                    <div className="flex-1 bg-white/10 rounded-full h-2">
                      <div
                        className={`${getRecommendationColorClasses().bg} h-2 rounded-full transition-all duration-500`}
                        style={{ width: `${result.confidence * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium text-white/90">
                      {Math.round(result.confidence * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Impact */}
            <div className="bg-slate-900/40 backdrop-blur-2xl rounded-2xl border border-violet-500/20 shadow-xl p-6">
              <h3 className="text-xl font-semibold text-white mb-4">Financial Impact</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                  <p className="text-sm text-white/70 mb-1">Available Cash Before</p>
                  <p className="text-2xl font-bold text-blue-400">
                    {formatCurrency(result.financial_impact.available_cash_before)}
                  </p>
                </div>
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4">
                  <p className="text-sm text-white/70 mb-1">Available Cash After</p>
                  <p className="text-2xl font-bold text-purple-400">
                    {formatCurrency(result.financial_impact.available_cash_after)}
                  </p>
                </div>
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                  <p className="text-sm text-white/70 mb-1">% of Monthly Income</p>
                  <p className="text-2xl font-bold text-green-400">
                    {result.financial_impact.purchase_percentage_of_income.toFixed(1)}%
                  </p>
                </div>
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
                  <p className="text-sm text-white/70 mb-1">% of Available Cash</p>
                  <p className="text-2xl font-bold text-orange-400">
                    {result.financial_impact.purchase_percentage_of_available.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
        </div>
      </div>
    </div>
  );
};

export default CanIAffordThisPage;

