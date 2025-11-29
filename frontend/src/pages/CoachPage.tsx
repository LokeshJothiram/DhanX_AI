import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PaperAirplaneIcon,
  UserIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { coachAPI } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'agent';
  agent?: string;
  timestamp: Date;
}

const CoachPage: React.FC = () => {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: t('coach.welcomeMessage'),
      sender: 'agent',
      agent: t('common.aiCoach'),
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(true);

  const scrollToBottom = () => {
    if (shouldScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Only scroll on initial mount
  useEffect(() => {
    scrollToBottom();
  }, []);

  // Check if user is near bottom before auto-scrolling
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const isNearBottom = 
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    
    shouldScrollRef.current = isNearBottom;
    
    if (isNearBottom) {
      scrollToBottom();
    }
  }, [messages]);

  const quickQuestions = [
    t('coach.quickQuestion1'),
    t('coach.quickQuestion2'),
    t('coach.quickQuestion3'),
    t('coach.quickQuestion4'),
    t('coach.quickQuestion5'),
    t('coach.quickQuestion6'),
  ];

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: messages.length + 1,
      text: input,
      sender: 'user',
      timestamp: new Date(),
    };

    const queryText = input;
    
    // Always scroll when user sends a message
    shouldScrollRef.current = true;
    setMessages([...messages, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      // Call the real AI coach API
      const response = await coachAPI.query(queryText);
      
      // Extract LLM response text and clean up markdown formatting
      let responseText = '';
      if (response.llm && response.llm.text) {
        // Convert markdown bullets to plain text bullets
        responseText = response.llm.text
          .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold markdown
          .replace(/\*   \*\*([^*]+)\*\*/g, '• $1') // Convert markdown bullets
          .replace(/\*   /g, '• ') // Convert remaining markdown bullets
          .replace(/\n\n/g, '\n'); // Clean up extra newlines
      } else {
        responseText = t('coach.analyzingData');
      }

      // Add additional context from agents if available
      let additionalInfo = '';
      
      // Income agent insights
      if (response.income) {
        if (response.income.recent_income && response.income.recent_income.received) {
          additionalInfo += `\n\n💰 Weekly Payment Alert: You received ₹${response.income.recent_income.total_amount} in the last 7 days!`;
        }
        if (response.income.summary && !response.income.recent_income?.received) {
          additionalInfo += `\n\n📊 ${response.income.summary}`;
        }
      }

      // Goals agent insights - show recommendations if they exist
      if (response.goals) {
        if (response.goals.recommendations && response.goals.recommendations.length > 0) {
          additionalInfo += `\n\n🎯 ${response.goals.message || 'Goal Allocation Recommendations:'}`;
          response.goals.recommendations.forEach((rec: any) => {
            additionalInfo += `\n• ${rec.message}`;
          });
        }
        if (response.goals.created) {
          additionalInfo += `\n\n✅ ${response.goals.message}`;
        }
      }

      // Spending agent insights
      if (response.spending && response.spending.intervention) {
        additionalInfo += `\n\n💸 ${response.spending.intervention.message}`;
      }
      
      // Spending tips
      if (response.spending && response.spending.tips && response.spending.tips.length > 0) {
        response.spending.tips.forEach((tip: string) => {
          additionalInfo += `\n\n💡 ${tip}`;
        });
      }

      // Emergency fund insights
      if (response.emergency && response.emergency.dry_warning) {
        additionalInfo += `\n\n🛡️ ${response.emergency.dry_warning}`;
      }

      // Agentic actions taken
      if (response.agentic_actions && response.agentic_actions.length > 0) {
        additionalInfo += `\n\n🤖 Autonomous Actions Taken:\n`;
        response.agentic_actions.forEach((action: any) => {
          if (action.message) {
            additionalInfo += `✅ ${action.message}\n`;
          }
        });
      }

      const agentMessage: Message = {
        id: messages.length + 2,
        text: responseText + additionalInfo,
        sender: 'agent',
        agent: t('common.aiCoach'),
        timestamp: new Date(),
      };

      // Always scroll when agent responds
      shouldScrollRef.current = true;
      setMessages((prev) => [...prev, agentMessage]);
      setIsTyping(false);
    } catch (error: any) {
      console.error('Error calling coach API:', error);
      const errorMessage: Message = {
        id: messages.length + 2,
        text: error.response?.data?.detail || t('coach.errorMessage'),
        sender: 'agent',
        agent: t('common.aiCoach'),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsTyping(false);
    }
  };

  const handleQuickQuestion = (question: string) => {
    setInput(question);
  };

  const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">{t('coach.title')}</h1>
        <p className="text-white/70">{t('coach.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chat Interface */}
        <div className="lg:col-span-2">
          <div className="bg-slate-900/40 backdrop-blur-2xl rounded-xl border border-violet-500/20 shadow-xl h-[600px] flex flex-col">
            {/* Messages */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-6 space-y-4">
              <AnimatePresence>
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial="hidden"
                    animate="visible"
                    variants={fadeInUp}
                    className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl p-4 backdrop-blur-xl ${
                        message.sender === 'user'
                          ? 'bg-gradient-to-r from-violet-600/90 to-purple-600/90 text-white shadow-lg shadow-violet-500/20 border border-violet-400/30'
                          : 'bg-white/10 text-white border border-violet-500/20'
                      }`}
                    >
                      {message.agent && (
                        <div className="flex items-center space-x-2 mb-2">
                          <SparklesIcon className="h-4 w-4" />
                          <span className="text-xs font-semibold opacity-80">{message.agent}</span>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{message.text}</p>
                      <p className="text-xs opacity-60 mt-2">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {isTyping && (
                <motion.div
                  initial="hidden"
                  animate="visible"
                  className="flex justify-start"
                >
                  <div className="bg-white/10 rounded-2xl p-4">
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-violet-500/20">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder={t('coach.askYourAICoach')}
                  className="flex-1 px-4 py-3 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="p-3 bg-gradient-to-r from-violet-600/90 to-purple-600/90 text-white rounded-xl hover:shadow-lg hover:shadow-violet-500/30 backdrop-blur-sm border border-violet-400/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PaperAirplaneIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Questions & Agent Info */}
        <div className="space-y-6">
          {/* Quick Questions */}
          <div className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl">
            <h2 className="text-lg font-bold text-white mb-4">{t('coach.quickQuestions')}</h2>
            <div className="space-y-2">
              {quickQuestions.map((question, index) => (
                <button
                  key={index}
                  onClick={() => handleQuickQuestion(question)}
                  className="w-full text-left p-3 bg-white/5 backdrop-blur-sm hover:bg-white/10 rounded-lg border border-transparent hover:border-violet-500/20 text-sm text-white/80 hover:text-white transition-all"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>

          {/* Agent Info */}
          <div className="bg-slate-900/40 backdrop-blur-2xl rounded-xl p-6 border border-violet-500/20 shadow-xl">
            <h2 className="text-lg font-bold text-white mb-4">{t('coach.yourAIAgents')}</h2>
            <div className="space-y-3">
              {[
                { name: t('coach.agent1Name'), desc: t('coach.agent1Desc') },
                { name: t('coach.agent2Name'), desc: t('coach.agent2Desc') },
                { name: t('coach.agent3Name'), desc: t('coach.agent3Desc') },
                { name: t('coach.agent4Name'), desc: t('coach.agent4Desc') },
              ].map((agent, index) => (
                <div key={index} className="p-3 bg-white/5 backdrop-blur-sm rounded-lg border border-transparent hover:border-violet-500/20 transition-all">
                  <p className="text-sm font-semibold text-white">{agent.name}</p>
                  <p className="text-xs text-white/60">{agent.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoachPage;

