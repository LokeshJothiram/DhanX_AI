import { useState, useEffect, useCallback } from 'react';
import { coachAPI } from '../services/api';

interface AICoachResponse {
  income?: any;
  spending?: any;
  goals?: any;
  emergency?: any;
  llm?: {
    text: string;
  };
  agentic_actions?: Array<{
    success: boolean;
    message?: string;
    goal_id?: string;
    allocated?: number;
    [key: string]: any;
  }>;
  autonomous_mode?: boolean;
  memory?: {
    actions_count: number;
    last_updated: string;
  };
}

interface UseAICoachOptions {
  context: 'income' | 'spending' | 'goals' | 'emergency' | 'dashboard';
  autoLoad?: boolean;
  delay?: number; // Delay in milliseconds before loading (for lazy loading)
}

export const useAICoach = (options: UseAICoachOptions) => {
  const { context, autoLoad = true, delay = 1000 } = options; // Default 1 second delay
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<AICoachResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Context-specific queries
  const contextQueries: Record<string, string> = {
    income: 'Analyze my income pattern and provide recommendations',
    spending: 'Analyze my spending and provide recommendations',
    goals: 'Review my goals and provide recommendations',
    emergency: 'Analyze my emergency fund status and provide recommendations',
    dashboard: 'Provide a summary of my financial health and top recommendations',
  };

  const fetchRecommendations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const query = contextQueries[context] || contextQueries.dashboard;
      const response = await coachAPI.query(query);
      setRecommendations(response);
    } catch (err: any) {
      console.error('Error fetching AI recommendations:', err);
      setError(err.response?.data?.detail || 'Failed to load AI recommendations');
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    if (autoLoad) {
      // Load AI recommendations after a delay to let main content load first
      const timeoutId = setTimeout(() => {
      fetchRecommendations();
      }, delay);

      return () => clearTimeout(timeoutId);
    }
  }, [autoLoad, delay, fetchRecommendations]);

  return {
    recommendations,
    loading,
    error,
    refetch: fetchRecommendations,
  };
};

