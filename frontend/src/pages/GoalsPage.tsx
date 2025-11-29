import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlusIcon,
  FlagIcon,
  CheckCircleIcon,
  ChartBarIcon,
  LightBulbIcon,
  ShieldCheckIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';
import AlertModal from '../components/AlertModal';
import { goalsAPI } from '../services/api';
import { useData } from '../context/DataContext';

interface Goal {
  id: string;
  name: string;
  target: number;
  saved: number;
  deadline?: string;
  type?: string;
  is_completed: boolean;
  created_at: string;
}

const GoalsPage: React.FC = () => {
  const { t } = useLanguage();
  const { showAgentAction, showSuccess } = useNotification();
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showEditGoal, setShowEditGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [goalForm, setGoalForm] = useState({
    name: '',
    target: '',
    deadline: '',
    type: 'micro-savings',
  });
  const [activeGoals, setActiveGoals] = useState<Goal[]>([]);
  const [deletingGoal, setDeletingGoal] = useState<string | null>(null);
  const [newlyCreatedGoalIds, setNewlyCreatedGoalIds] = useState<Set<string>>(new Set());
  const [previousGoalsCount, setPreviousGoalsCount] = useState(0);
  
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
  
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    goalId: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    goalId: '',
  });

  // Use pre-loaded goals from DataContext
  const { goals: sharedGoals, goalsLoading, refreshGoals, connectionsData } = useData();
  const [isCreatingGoals, setIsCreatingGoals] = useState(false);

  // Refresh goals when page is visited (in case goals were created in background)
  useEffect(() => {
    // Refresh goals when component mounts or becomes visible
    const refreshOnVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshGoals().catch(err => console.error('Error refreshing goals:', err));
      }
    };
    
    // Refresh immediately when page loads
    refreshGoals().catch(err => console.error('Error refreshing goals:', err));
    
    // Also refresh when page becomes visible (user switches back to tab)
    document.addEventListener('visibilitychange', refreshOnVisible);
    
    return () => {
      document.removeEventListener('visibilitychange', refreshOnVisible);
    };
  }, [refreshGoals]);

  // Check if goals are being created in background (user has connections but no goals)
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    
    const checkAndPoll = async () => {
      const hasConnections = connectionsData && connectionsData.length > 0;
      const hasAnyGoals = sharedGoals && sharedGoals.length > 0;
      const nonEmergencyGoals = sharedGoals ? sharedGoals.filter((g: Goal) => g.type !== 'emergency') : [];
      
      // Only show "AI is creating goals" if:
      // 1. User has connections (so goals might be auto-created)
      // 2. No goals exist at all (not just no non-emergency goals)
      // 3. Goals are not currently loading
      if (hasConnections && !hasAnyGoals && !goalsLoading) {
        setIsCreatingGoals(true);
        
        // Poll for goals (check every 2 seconds for up to 60 seconds)
        let pollCount = 0;
        const maxPolls = 30; // 30 * 2 seconds = 60 seconds max
        
        pollInterval = setInterval(async () => {
          pollCount++;
          try {
            // Refresh goals from context
            await refreshGoals();
            
            // Also directly fetch to check if goals exist
            const updatedGoals = await goalsAPI.getGoals(true);
            
            // Stop polling if ANY goals are found (not just non-emergency)
            if (updatedGoals && updatedGoals.length > 0) {
              setIsCreatingGoals(false);
              if (pollInterval) clearInterval(pollInterval);
              
              // Show toast notification for auto-created goals
              const nonEmergencyGoals = updatedGoals.filter((g: Goal) => g.type !== 'emergency');
              if (nonEmergencyGoals.length > 0) {
                showAgentAction(
                  `AI created ${nonEmergencyGoals.length} goal${nonEmergencyGoals.length > 1 ? 's' : ''} for you based on your income patterns!`,
                  '🤖 Goals Auto-Created'
                );
              }
              return;
            }
            
            // Stop polling after max attempts
            if (pollCount >= maxPolls) {
              setIsCreatingGoals(false);
              if (pollInterval) clearInterval(pollInterval);
            }
          } catch (err) {
            console.error('Error polling for goals:', err);
            if (pollCount >= maxPolls) {
              setIsCreatingGoals(false);
              if (pollInterval) clearInterval(pollInterval);
            }
          }
        }, 2000); // Check every 2 seconds
      } else {
        setIsCreatingGoals(false);
      }
    };
    
    checkAndPoll();
    
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [connectionsData, sharedGoals, goalsLoading, refreshGoals]);

  useEffect(() => {
    // Use pre-loaded goals - no need to fetch separately
    // Filter out Emergency Fund goals (they have their own page)
    // Show all goals together (completed goals stay in main list with checkmark)
    if (!goalsLoading && sharedGoals.length >= 0) {
      // Clear isCreatingGoals if goals are loaded (even if they're emergency goals)
      if (sharedGoals.length > 0) {
        setIsCreatingGoals(false);
      }
      
      // Filter out emergency fund goals - they should only show on Emergency Fund page
      const nonEmergencyGoals = sharedGoals.filter((g: Goal) => g.type !== 'emergency');
      // Sort: active goals first, then completed goals
      const active = nonEmergencyGoals.filter((g: Goal) => !g.is_completed);
      const completed = nonEmergencyGoals.filter((g: Goal) => g.is_completed);
      // Combine: active first, then completed
      const newGoalsList = [...active, ...completed];
      
      // Detect newly created goals by comparing with previous count
      if (newGoalsList.length > previousGoalsCount) {
        const previousGoalIds = new Set(activeGoals.map(g => g.id));
        const newGoalIds = newGoalsList
          .filter(g => !previousGoalIds.has(g.id))
          .map(g => g.id);
        
        if (newGoalIds.length > 0) {
          setNewlyCreatedGoalIds(new Set(newGoalIds));
          // Clear the "new" flag after animation completes (3 seconds)
          setTimeout(() => {
            setNewlyCreatedGoalIds(new Set());
          }, 3000);
        }
      }
      
      setPreviousGoalsCount(newGoalsList.length);
      setActiveGoals(newGoalsList);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedGoals, goalsLoading]);

  const suggestions = [
    {
      title: t('goals.startWith50PerDay'),
      description: t('goals.startWith50Desc'),
      icon: LightBulbIcon,
    },
    {
      title: t('goals.emergencyFundPriority'),
      description: t('goals.emergencyFundDesc'),
      icon: ShieldCheckIcon,
    },
    {
      title: t('goals.investmentGoals'),
      description: t('goals.investmentGoalsDesc'),
      icon: ChartBarIcon,
    },
  ];

  const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  const handleEditGoal = (goal: Goal) => {
    setEditingGoal(goal);
    setGoalForm({
      name: goal.name,
      target: goal.target.toString(),
      deadline: goal.deadline ? new Date(goal.deadline).toISOString().split('T')[0] : '',
      type: goal.type || 'micro-savings',
    });
    setShowEditGoal(true);
  };

  const handleDeleteGoal = async (goalId: string) => {
    setConfirmModal({
      isOpen: true,
      title: t('goals.deleteGoal'),
      message: t('goals.deleteGoalConfirm'),
      goalId,
    });
  };

  const confirmDeleteGoal = async () => {
    const goalId = confirmModal.goalId;
    if (!goalId) return;

    try {
      setDeletingGoal(goalId);
      await goalsAPI.deleteGoal(goalId);
      await refreshGoals(); // Reload goals from context
      setConfirmModal({ ...confirmModal, isOpen: false });
    } catch (err) {
      console.error('Error deleting goal:', err);
      setAlertModal({
        isOpen: true,
        title: t('common.error'),
        message: t('goals.deleteGoalFailed'),
        type: 'error',
      });
    } finally {
      setDeletingGoal(null);
    }
  };

  const handleUpdateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGoal) return;

    try {
      await goalsAPI.updateGoal(editingGoal.id, {
        name: goalForm.name,
        target: parseFloat(goalForm.target),
        deadline: goalForm.deadline || undefined,
        type: goalForm.type,
      });
      setShowEditGoal(false);
      setEditingGoal(null);
      setGoalForm({
        name: '',
        target: '',
        deadline: '',
        type: 'micro-savings',
      });
      await refreshGoals(); // Reload goals from context
    } catch (err) {
      console.error('Error updating goal:', err);
      setAlertModal({
        isOpen: true,
        title: t('common.error'),
        message: t('goals.updateGoalFailed'),
        type: 'error',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">{t('goals.title')}</h1>
          <p className="text-white/70">{t('goals.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowAddGoal(true)}
          className="mt-4 sm:mt-0 flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-violet-600/90 via-purple-600/90 to-fuchsia-600/90 text-white rounded-xl hover:shadow-lg hover:shadow-violet-500/30 backdrop-blur-sm border border-violet-400/30 transition-all"
        >
          <PlusIcon className="h-5 w-5" />
          <span>{t('goals.newGoal')}</span>
        </button>
      </div>

      {/* All Goals (Active + Completed) */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4">{t('goals.activeGoals')}</h2>
        {goalsLoading || isCreatingGoals ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-12"
          >
            <div className="relative">
              {/* Animated sparkles around spinner */}
              <motion.div
                animate={{ 
                  rotate: 360,
                  scale: [1, 1.2, 1]
                }}
                transition={{ 
                  rotate: { duration: 2, repeat: Infinity, ease: "linear" },
                  scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                }}
                className="absolute inset-0"
              >
                <SparklesIcon className="h-16 w-16 text-violet-400/30" />
              </motion.div>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <svg className="h-12 w-12 text-violet-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </motion.div>
            </div>
            <motion.p 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-white/80 mt-4 text-lg font-medium"
            >
              {isCreatingGoals ? '🤖 AI is creating your goals...' : t('common.loading')}
            </motion.p>
            {isCreatingGoals && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="mt-2 text-center max-w-md"
              >
                <p className="text-white/50 text-sm">
                  Analyzing your income patterns and creating personalized savings goals...
                </p>
                <div className="flex items-center justify-center space-x-1 mt-3">
                  <motion.div
                    className="w-2 h-2 bg-violet-400 rounded-full"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                  />
                  <motion.div
                    className="w-2 h-2 bg-violet-400 rounded-full"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                  />
                  <motion.div
                    className="w-2 h-2 bg-violet-400 rounded-full"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                  />
                </div>
              </motion.div>
            )}
          </motion.div>
        ) : activeGoals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <p className="text-white/60 mb-4">{t('goals.noActiveGoals')}</p>
            <p className="text-sm text-white/40 text-center">
              {t('goals.createFirstGoal')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeGoals.map((goal, index) => {
              const progress = goal.target > 0 ? Math.round((Number(goal.saved) / Number(goal.target)) * 100) : 0;
              const isNewlyCreated = newlyCreatedGoalIds.has(goal.id);
              
              // Different animation for newly created goals
              const animationVariants = isNewlyCreated ? {
                hidden: { opacity: 0, scale: 0.8, y: 20 },
                visible: { 
                  opacity: 1, 
                  scale: 1, 
                  y: 0,
                  transition: { 
                    type: "spring",
                    stiffness: 300,
                    damping: 20,
                    delay: index * 0.15
                  }
                }
              } : fadeInUp;
              
              return (
                <motion.div
                  key={goal.id}
                  initial="hidden"
                  animate="visible"
                  variants={animationVariants}
                  transition={isNewlyCreated ? undefined : { delay: index * 0.1 }}
                  className={`bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border shadow-xl hover:border-violet-400/30 transition-all ${
                    isNewlyCreated 
                      ? 'border-violet-400/50 ring-2 ring-violet-500/30' 
                      : 'border-violet-500/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 backdrop-blur-sm border border-white/10">
                        {goal.is_completed ? (
                          <CheckCircleIcon className="h-6 w-6 text-green-400" />
                        ) : (
                          <FlagIcon className="h-6 w-6 text-violet-300" />
                        )}
                      </div>
                      {goal.is_completed && (
                        <span className="text-xs px-2 py-1 bg-green-500/20 rounded-lg text-green-400 font-medium">
                          ✓ Completed
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                    <span className="text-xs px-2 py-1 bg-white/10 rounded-lg text-white/70 capitalize">
                      {goal.type?.replace('-', ' ') || 'goal'}
                    </span>
                      <button
                        onClick={() => handleEditGoal(goal)}
                        className="p-1.5 hover:bg-white/10 rounded-lg transition-all"
                        title={t('goals.editGoal')}
                      >
                        <PencilIcon className="h-4 w-4 text-white/70 hover:text-white" />
                      </button>
                      <button
                        onClick={() => handleDeleteGoal(goal.id)}
                        disabled={deletingGoal === goal.id}
                        className="p-1.5 hover:bg-red-500/20 rounded-lg transition-all disabled:opacity-50"
                        title={t('common.delete')}
                      >
                        <TrashIcon className="h-4 w-4 text-red-400 hover:text-red-300" />
                      </button>
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2 flex items-center space-x-2">
                    <span>{goal.name}</span>
                    {goal.is_completed && (
                      <CheckCircleIcon className="h-5 w-5 text-green-400" />
                    )}
                  </h3>
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-white/60">{t('goals.progress')}</span>
                      <span className="text-sm font-semibold text-white">{progress}%</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          goal.is_completed 
                            ? 'bg-gradient-to-r from-green-500 to-emerald-500' 
                            : 'bg-gradient-to-r from-violet-500 to-purple-500'
                        }`}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-white/60">{t('goals.saved')}</span>
                    <span className={`text-sm font-bold ${goal.is_completed ? 'text-green-400' : 'text-white'}`}>
                      ₹{Number(goal.saved).toLocaleString()} / ₹{Number(goal.target).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/50">
                      {goal.deadline ? `${t('goals.deadline')}: ${new Date(goal.deadline).toLocaleDateString()}` : t('goals.noDeadline')}
                    </span>
                    <span className={`text-xs ${goal.is_completed ? 'text-green-400 font-medium' : progress >= 80 ? 'text-green-400' : progress >= 50 ? 'text-yellow-400' : 'text-orange-400'}`}>
                      {goal.is_completed ? '✓ Completed' : progress >= 80 ? t('goals.onTrack') : progress >= 50 ? t('goals.goodProgress') : t('goals.needsAttention')}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Investment Suggestions */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl"
      >
        <h2 className="text-xl font-bold text-white mb-4">{t('goals.investmentSuggestions')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              className="p-4 bg-white/5 backdrop-blur-sm rounded-lg border border-violet-500/20 hover:border-violet-400/30 transition-all"
            >
              <div className="flex items-center space-x-3 mb-3">
                <div className="p-2 rounded-lg bg-violet-500/20">
                  <suggestion.icon className="h-5 w-5 text-violet-300" />
                </div>
                <h3 className="font-semibold text-white">{suggestion.title}</h3>
              </div>
              <p className="text-sm text-white/70">{suggestion.description}</p>
            </div>
          ))}
        </div>
      </motion.div>


      {/* Add Goal Modal */}
      <AnimatePresence>
        {showAddGoal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddGoal(false)}
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
                  <h2 className="text-2xl font-bold text-white">{t('goals.createNewGoal')}</h2>
                  <button
                    onClick={() => setShowAddGoal(false)}
                    className="p-2 rounded-xl hover:bg-white/10 text-white transition-all"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
                
                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await goalsAPI.createGoal({
                        name: goalForm.name,
                        target: parseFloat(goalForm.target),
                        deadline: goalForm.deadline || undefined,
                        type: goalForm.type,
                        saved: 0,
                      });
                      setShowAddGoal(false);
                      setGoalForm({
                        name: '',
                        target: '',
                        deadline: '',
                        type: 'micro-savings',
                      });
                      await refreshGoals(); // Reload goals from context
                    } catch (err) {
                      console.error('Error creating goal:', err);
                      setAlertModal({
                        isOpen: true,
                        title: t('common.error'),
                        message: t('goals.createGoalFailed'),
                        type: 'error',
                      });
                    }
                  }}
                  className="p-6 space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      {t('goals.goalName')}
                    </label>
                    <input
                      type="text"
                      required
                      value={goalForm.name}
                      onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                      placeholder={t('goals.goalNamePlaceholder')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      {t('goals.targetAmount')}
                    </label>
                    <input
                      type="number"
                      required
                      value={goalForm.target}
                      onChange={(e) => setGoalForm({ ...goalForm, target: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                      placeholder={t('goals.enterTargetAmount')}
                      min="1"
                      step="0.01"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      {t('goals.deadline')}
                    </label>
                    <input
                      type="date"
                      required
                      value={goalForm.deadline}
                      onChange={(e) => setGoalForm({ ...goalForm, deadline: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      {t('goals.goalType')}
                    </label>
                    <select
                      value={goalForm.type}
                      onChange={(e) => setGoalForm({ ...goalForm, type: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                    >
                      <option value="micro-savings" className="bg-slate-900">{t('goals.microSavings')}</option>
                      <option value="emergency" className="bg-slate-900">{t('goals.emergency')}</option>
                      <option value="vacation" className="bg-slate-900">{t('goals.vacation')}</option>
                      <option value="investment" className="bg-slate-900">{t('goals.investment')}</option>
                      <option value="purchase" className="bg-slate-900">{t('goals.purchase')}</option>
                      <option value="other" className="bg-slate-900">{t('goals.other')}</option>
                    </select>
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowAddGoal(false)}
                      className="flex-1 px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white hover:bg-white/10 transition-all"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2.5 bg-gradient-to-r from-violet-600/90 to-purple-600/90 text-white rounded-xl hover:shadow-lg hover:shadow-violet-500/30 backdrop-blur-sm border border-violet-400/30 transition-all"
                    >
                      {t('goals.createGoal')}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Edit Goal Modal */}
      <AnimatePresence>
        {showEditGoal && editingGoal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowEditGoal(false);
                setEditingGoal(null);
              }}
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
                  <h2 className="text-2xl font-bold text-white">{t('goals.editGoal')}</h2>
                  <button
                    onClick={() => {
                      setShowEditGoal(false);
                      setEditingGoal(null);
                    }}
                    className="p-2 rounded-xl hover:bg-white/10 text-white transition-all"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
                
                <form 
                  onSubmit={handleUpdateGoal}
                  className="p-6 space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      {t('goals.goalName')}
                    </label>
                    <input
                      type="text"
                      required
                      value={goalForm.name}
                      onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                      placeholder={t('goals.goalNamePlaceholder')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      {t('goals.targetAmount')}
                    </label>
                    <input
                      type="number"
                      required
                      value={goalForm.target}
                      onChange={(e) => setGoalForm({ ...goalForm, target: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                      placeholder={t('goals.enterTargetAmount')}
                      min="1"
                      step="0.01"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      {t('goals.deadline')}
                    </label>
                    <input
                      type="date"
                      value={goalForm.deadline}
                      onChange={(e) => setGoalForm({ ...goalForm, deadline: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      {t('goals.goalType')}
                    </label>
                    <select
                      value={goalForm.type}
                      onChange={(e) => setGoalForm({ ...goalForm, type: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                    >
                      <option value="micro-savings" className="bg-slate-900">{t('goals.microSavings')}</option>
                      <option value="emergency" className="bg-slate-900">{t('goals.emergency')}</option>
                      <option value="vacation" className="bg-slate-900">{t('goals.vacation')}</option>
                      <option value="investment" className="bg-slate-900">{t('goals.investment')}</option>
                      <option value="purchase" className="bg-slate-900">{t('goals.purchase')}</option>
                      <option value="other" className="bg-slate-900">{t('goals.other')}</option>
                    </select>
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEditGoal(false);
                        setEditingGoal(null);
                      }}
                      className="flex-1 px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white hover:bg-white/10 transition-all"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2.5 bg-gradient-to-r from-violet-600/90 to-purple-600/90 text-white rounded-xl hover:shadow-lg hover:shadow-violet-500/30 backdrop-blur-sm border border-violet-400/30 transition-all"
                    >
                      {t('goals.updateGoal')}
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

      {/* Confirm Modal */}
      <AlertModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        title={confirmModal.title}
        message={confirmModal.message}
        type="warning"
        confirmText={t('common.confirm')}
        onConfirm={confirmDeleteGoal}
        showCancel={true}
        cancelText={t('common.cancel')}
      />
    </div>
  );
};

export default GoalsPage;

