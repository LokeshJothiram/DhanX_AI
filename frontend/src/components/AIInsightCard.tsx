import React from 'react';
import { motion } from 'framer-motion';
import { SparklesIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

interface AIInsightCardProps {
  title?: string;
  message: string;
  type?: 'income' | 'spending' | 'goals' | 'emergency' | 'general';
  loading?: boolean;
  onRefresh?: () => void;
  className?: string;
}

const typeConfig = {
  income: {
    icon: '💰',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    iconColor: 'text-blue-400',
  },
  spending: {
    icon: '💸',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    iconColor: 'text-orange-400',
  },
  goals: {
    icon: '🎯',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    iconColor: 'text-purple-400',
  },
  emergency: {
    icon: '🛡️',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    iconColor: 'text-green-400',
  },
  general: {
    icon: '🤖',
    bgColor: 'bg-violet-500/10',
    borderColor: 'border-violet-500/30',
    iconColor: 'text-violet-400',
  },
};

const AIInsightCard: React.FC<AIInsightCardProps> = ({
  title,
  message,
  type = 'general',
  loading = false,
  onRefresh,
  className = '',
}) => {
  const config = typeConfig[type];

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`p-4 ${config.bgColor} border ${config.borderColor} rounded-xl backdrop-blur-sm ${className}`}
      >
        <div className="flex items-center space-x-3">
          <div className="animate-spin">
            <ArrowPathIcon className="h-5 w-5 text-white/60" />
          </div>
          <p className="text-sm text-white/60">Loading AI insights...</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-4 ${config.bgColor} border ${config.borderColor} rounded-xl backdrop-blur-sm ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          <span className="text-2xl">{config.icon}</span>
          <div className="flex-1">
            {title && (
              <p className="text-sm font-semibold text-white/80 mb-1">{title}</p>
            )}
            <p className="text-sm text-white/70 whitespace-pre-wrap">{message}</p>
          </div>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="ml-2 p-1.5 rounded-lg hover:bg-white/10 transition-all"
            title="Refresh recommendations"
          >
            <ArrowPathIcon className="h-4 w-4 text-white/60 hover:text-white/80" />
          </button>
        )}
      </div>
    </motion.div>
  );
};

export default AIInsightCard;

