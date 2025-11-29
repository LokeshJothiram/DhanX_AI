import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PaperAirplaneIcon,
  UserIcon,
  SparklesIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  FlagIcon,
  ShieldCheckIcon,
  PlayIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { transactionsAPI, coachAPI } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'system';
  timestamp: Date;
  agentExecuted?: string;
  result?: any;
}

interface Agent {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  isActive: boolean;
}

const PLAYGROUND_STORAGE_KEY = 'agent_playground_state';

const PlaygroundPage: React.FC = () => {
  const { t } = useLanguage();
  
  // Load initial state from localStorage or use default
  const loadSavedState = (): Message[] => {
    try {
      const saved = localStorage.getItem(PLAYGROUND_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Convert timestamp strings back to Date objects
        const messages = parsed.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        }));
        
        // Check if there was an interrupted processing
        if (parsed.wasProcessing === true) {
          // Remove any "Creating..." or "Processing..." messages
          const filteredMessages = messages.filter((msg: Message) => 
            !msg.text.includes('Creating') && 
            !msg.text.includes('Processing...')
          );
          
          // Add a note about interruption
          filteredMessages.push({
            id: filteredMessages.length + 1,
            text: '⚠️ Previous operation was interrupted when you navigated away. The transaction may have completed in the background. Check your Income/Spending pages to verify.',
            sender: 'system',
            timestamp: new Date(),
          });
          
          // Clear the wasProcessing flag
          localStorage.setItem(
            PLAYGROUND_STORAGE_KEY,
            JSON.stringify({
              messages: filteredMessages.map((msg: Message) => ({
                ...msg,
                timestamp: msg.timestamp.toISOString(),
              })),
              wasProcessing: false,
            })
          );
          
          return filteredMessages;
        }
        
        return messages;
      }
    } catch (error) {
      console.error('Error loading playground state:', error);
    }
    // Default welcome message
    return [
      {
        id: 1,
        text: 'Welcome to the Agent Playground! Type commands like "+1000" to add income or "-1000" to add expense, and watch the agents work!',
        sender: 'system',
        timestamp: new Date(),
      },
    ];
  };

  const [messages, setMessages] = useState<Message[]>(loadSavedState);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(true);
  const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set());
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(
        PLAYGROUND_STORAGE_KEY,
        JSON.stringify({
          messages: messages.map(msg => ({
            ...msg,
            timestamp: msg.timestamp.toISOString(), // Convert Date to string for storage
          })),
          wasProcessing: isProcessing, // Track if we're currently processing
        })
      );
    } catch (error) {
      console.error('Error saving playground state:', error);
    }
  }, [messages, isProcessing]);

  // Cleanup: Clear processing flag and timeouts when component unmounts
  useEffect(() => {
    return () => {
      // Clear any pending timeouts
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
      // Clear active agents
      setActiveAgents(new Set());
      // If processing, mark it as interrupted
      if (isProcessing) {
        try {
          const saved = localStorage.getItem(PLAYGROUND_STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            localStorage.setItem(
              PLAYGROUND_STORAGE_KEY,
              JSON.stringify({
                ...parsed,
                wasProcessing: true, // Mark as interrupted
              })
            );
          }
        } catch (error) {
          // Ignore errors
        }
      }
    };
  }, [isProcessing]);

  const agents: Agent[] = [
    {
      id: 'income_pattern_agent',
      name: 'Income Agent',
      description: 'Analyzes income patterns and allocates to goals',
      icon: <ArrowTrendingUpIcon className="w-6 h-6" />,
      color: 'bg-green-500',
      isActive: activeAgents.has('income_pattern_agent'),
    },
    {
      id: 'spending_watchdog_agent',
      name: 'Spending Agent',
      description: 'Monitors spending patterns and provides insights',
      icon: <ArrowTrendingDownIcon className="w-6 h-6" />,
      color: 'bg-red-500',
      isActive: activeAgents.has('spending_watchdog_agent'),
    },
    {
      id: 'goal_planner_agent',
      name: 'Goal Planner Agent',
      description: 'Plans and manages savings goals',
      icon: <FlagIcon className="w-6 h-6" />,
      color: 'bg-blue-500',
      isActive: activeAgents.has('goal_planner_agent'),
    },
    {
      id: 'emergency_fund_agent',
      name: 'Emergency Fund Agent',
      description: 'Manages emergency fund goals and allocations',
      icon: <ShieldCheckIcon className="w-6 h-6" />,
      color: 'bg-purple-500',
      isActive: activeAgents.has('emergency_fund_agent'),
    },
  ];

  const scrollToBottom = () => {
    if (shouldScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Only scroll on initial mount (if there are saved messages, scroll to show them)
  useEffect(() => {
    // Small delay to ensure DOM is ready
    setTimeout(() => {
      scrollToBottom();
    }, 100);
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

  const parseCommand = (text: string): { type: 'income' | 'expense' | 'query'; amount?: number } | null => {
    const trimmed = text.trim();
    
    // Check for income pattern: +number or + number
    const incomeMatch = trimmed.match(/^\+(\d+(?:\.\d+)?)$/);
    if (incomeMatch) {
      return { type: 'income', amount: parseFloat(incomeMatch[1]) };
    }
    
    // Check for expense pattern: -number or - number
    const expenseMatch = trimmed.match(/^-(\d+(?:\.\d+)?)$/);
    if (expenseMatch) {
      return { type: 'expense', amount: parseFloat(expenseMatch[1]) };
    }
    
    // Otherwise, treat as a query
    return { type: 'query' };
  };

  const triggerAgents = async (command: { type: 'income' | 'expense' | 'query'; amount?: number }) => {
    // Determine which agents will run and in what order (matching backend execution order)
    let agentExecutionOrder: string[] = [];
    
    if (command.type === 'income') {
      // Backend execution order: emergency_fund -> income_pattern -> goal_planner
      agentExecutionOrder = ['emergency_fund_agent', 'income_pattern_agent', 'goal_planner_agent'];
    } else if (command.type === 'expense') {
      agentExecutionOrder = ['spending_watchdog_agent'];
    } else {
      // Query triggers all agents in backend order
      agentExecutionOrder = ['emergency_fund_agent', 'income_pattern_agent', 'spending_watchdog_agent', 'goal_planner_agent'];
    }
    
    // Simulate sequential execution - show each agent as active one by one
    const executeAgentsSequentially = async () => {
      for (let i = 0; i < agentExecutionOrder.length; i++) {
        const agentId = agentExecutionOrder[i];
        
        // Show only this agent as active
        setActiveAgents(new Set([agentId]));
        
        // Wait a bit to show the agent is working (simulate processing time)
        // First agent gets more time, others get less
        const delay = i === 0 ? 1500 : 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    };
    
    // Start showing agents sequentially
    executeAgentsSequentially();
    
    try {
      // Trigger agents via coach query (this runs in parallel with the visual sequence)
      const query = command.type === 'income' 
        ? `I received ₹${command.amount} as income`
        : command.type === 'expense'
        ? `I spent ₹${command.amount}`
        : command.type === 'query'
        ? input
        : '';
      
      const response = await coachAPI.query(query);
      
      // Extract which agents were involved
      const executedAgents: string[] = [];
      if (response.income) executedAgents.push('income_pattern_agent');
      if (response.spending) executedAgents.push('spending_watchdog_agent');
      if (response.goals) executedAgents.push('goal_planner_agent');
      if (response.emergency) executedAgents.push('emergency_fund_agent');
      
      // Wait for visual sequence to complete, then clear
      processingTimeoutRef.current = setTimeout(() => {
        setActiveAgents(new Set());
        processingTimeoutRef.current = null;
      }, agentExecutionOrder.length * 1200 + 500);
      
      return { response, executedAgents };
    } catch (error) {
      // Clear on error
      setActiveAgents(new Set());
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
      throw error;
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage: Message = {
      id: messages.length + 1,
      text: input,
      sender: 'user',
      timestamp: new Date(),
    };

    // Always scroll when user sends a message
    shouldScrollRef.current = true;
    setMessages((prev) => [...prev, userMessage]);
    const commandText = input;
    setInput('');
    setIsProcessing(true);

    try {
      const command = parseCommand(commandText);
      
      if (!command) {
        throw new Error('Invalid command');
      }

      let systemMessage: Message;
      
      if (command.type === 'income' && command.amount) {
        // Create income transaction
        systemMessage = {
          id: messages.length + 2,
          text: `Creating income transaction of ₹${command.amount}...`,
          sender: 'system',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, systemMessage]);

        await transactionsAPI.createTransaction({
          amount: command.amount,
          type: 'income',
          description: `Playground income: ₹${command.amount}`,
          category: 'cash_income',
          source: 'playground',
          transaction_date: new Date().toISOString(),
        });

        // Trigger agents immediately to show execution
        const { response, executedAgents } = await triggerAgents(command);
        
        // Wait a bit for background allocation to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Format agent names nicely
        const agentNames = executedAgents.map(id => {
          const agent = agents.find(a => a.id === id);
          return agent ? agent.name : id;
        });
        
        systemMessage = {
          id: messages.length + 3,
          text: `✅ Income of ₹${command.amount} added!\n\n🤖 Agents executed:\n${agentNames.map(name => `  • ${name}`).join('\n')}\n\nIncome has been automatically allocated to your goals and emergency fund.`,
          sender: 'system',
          timestamp: new Date(),
          agentExecuted: agentNames.join(', '),
          result: response,
        };
        
      } else if (command.type === 'expense' && command.amount) {
        // Create expense transaction
        systemMessage = {
          id: messages.length + 2,
          text: `Creating expense transaction of ₹${command.amount}...`,
          sender: 'system',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, systemMessage]);

        await transactionsAPI.createTransaction({
          amount: command.amount,
          type: 'expense',
          description: `Playground expense: ₹${command.amount}`,
          category: 'other',
          source: 'playground',
          transaction_date: new Date().toISOString(),
        });

        // Trigger spending agent
        const { response, executedAgents } = await triggerAgents(command);
        
        // Format agent names nicely
        const agentNames = executedAgents.map(id => {
          const agent = agents.find(a => a.id === id);
          return agent ? agent.name : id;
        });
        
        systemMessage = {
          id: messages.length + 3,
          text: `✅ Expense of ₹${command.amount} added!\n\n🤖 Agents executed:\n${agentNames.map(name => `  • ${name}`).join('\n')}\n\nSpending agent analyzed your transaction.`,
          sender: 'system',
          timestamp: new Date(),
          agentExecuted: agentNames.join(', '),
          result: response,
        };
        
      } else {
        // Regular query
        const { response, executedAgents } = await triggerAgents(command);
        
        // Format agent names nicely
        const agentNames = executedAgents.map(id => {
          const agent = agents.find(a => a.id === id);
          return agent ? agent.name : id;
        });
        
        const agentInfo = agentNames.length > 0 
          ? `\n\n🤖 Agents executed: ${agentNames.join(', ')}`
          : '';
        
        systemMessage = {
          id: messages.length + 2,
          text: (response.llm?.text || 'Agents processed your query.') + agentInfo,
          sender: 'system',
          timestamp: new Date(),
          agentExecuted: agentNames.join(', '),
          result: response,
        };
      }

      setMessages((prev) => [...prev, systemMessage]);
    } catch (error: any) {
      const errorMessage: Message = {
        id: messages.length + 2,
        text: `Error: ${error.response?.data?.detail || error.message || 'Something went wrong'}`,
        sender: 'system',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
      // Clear processing flag in localStorage
      try {
        const saved = localStorage.getItem(PLAYGROUND_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          localStorage.setItem(
            PLAYGROUND_STORAGE_KEY,
            JSON.stringify({
              ...parsed,
              wasProcessing: false,
            })
          );
        }
      } catch (error) {
        // Ignore errors
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = () => {
    // Clear messages and reset to welcome message
    const welcomeMessage: Message = {
      id: 1,
      text: 'Welcome to the Agent Playground! Type commands like "+1000" to add income or "-1000" to add expense, and watch the agents work!',
      sender: 'system',
      timestamp: new Date(),
    };
    
    setMessages([welcomeMessage]);
    setInput('');
    setActiveAgents(new Set());
    
    // Clear from localStorage
    try {
      localStorage.setItem(
        PLAYGROUND_STORAGE_KEY,
        JSON.stringify({
          messages: [{
            ...welcomeMessage,
            timestamp: welcomeMessage.timestamp.toISOString(),
          }],
          wasProcessing: false,
        })
      );
    } catch (error) {
      console.error('Error clearing playground state:', error);
    }
  };

  const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  };

  return (
    <div className="space-y-6">
      {/* Header - Matching IncomePage structure */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Agent Playground</h1>
          <p className="text-white/70">Watch your financial agents work in real-time. Type commands to see them execute!</p>
        </div>
        <button
          onClick={handleClearChat}
          disabled={isProcessing}
          className="mt-4 sm:mt-0 flex items-center space-x-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-violet-500/30 hover:border-violet-400/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          title="Clear chat history and restart"
        >
          <ArrowPathIcon className="h-5 w-5" />
          <span>Clear Chat</span>
        </button>
      </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Agents */}
          <div className="lg:col-span-1">
            <div className="bg-slate-900/40 backdrop-blur-2xl rounded-xl border border-violet-500/20 shadow-xl h-[calc(100vh-15rem)] lg:h-[calc(100vh-13rem)] flex flex-col">
              <div className="p-6 border-b border-violet-500/20">
                <h2 className="text-xl font-bold text-white mb-1">Agents</h2>
                <p className="text-sm text-white/60">Watch agents execute in real-time</p>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
                {agents.map((agent) => (
                  <motion.div
                    key={agent.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: agent.isActive ? 1.02 : 1,
                      boxShadow: agent.isActive
                        ? '0 10px 25px -5px rgba(139, 92, 246, 0.4)'
                        : '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                    }}
                    className={`relative p-4 rounded-xl border-2 transition-all duration-300 ${
                      agent.isActive
                        ? 'border-violet-500/60 bg-gradient-to-br from-violet-500/20 to-purple-500/20 shadow-lg shadow-violet-500/30'
                        : 'border-violet-500/20 bg-white/5 backdrop-blur-sm hover:border-violet-500/40 hover:bg-white/10'
                    }`}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="flex items-start space-x-3">
                      <div className={`${agent.color} p-2.5 rounded-lg text-white shadow-lg`}>
                        {agent.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white text-sm">{agent.name}</h3>
                        <p className="text-xs text-white/60 mt-1 leading-relaxed">{agent.description}</p>
                      </div>
                      {agent.isActive && (
                        <motion.div
                          className="absolute top-2 right-2"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          <PlayIcon className="w-5 h-5 text-violet-400" />
                        </motion.div>
                      )}
                    </div>
                    {agent.isActive && (
                      <motion.div
                        className="mt-3 h-1 bg-violet-500/30 rounded-full overflow-hidden"
                        initial={{ width: 0 }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <motion.div
                          className="h-full bg-gradient-to-r from-violet-500 to-purple-500"
                          animate={{ x: ['-100%', '100%'] }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        />
                      </motion.div>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Side - Chat Interface */}
          <div className="lg:col-span-3">
            <div className="bg-slate-900/40 backdrop-blur-2xl rounded-xl border border-violet-500/20 shadow-xl h-[calc(100vh-15rem)] lg:h-[calc(100vh-13rem)] flex flex-col">
              {/* Messages */}
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide min-h-0">
                <AnimatePresence>
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial="hidden"
                      animate="visible"
                      variants={fadeInUp}
                      exit={{ opacity: 0 }}
                      className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl p-4 backdrop-blur-xl ${
                          message.sender === 'user'
                            ? 'bg-gradient-to-r from-violet-600/90 to-purple-600/90 text-white shadow-lg shadow-violet-500/20 border border-violet-400/30'
                            : 'bg-white/10 text-white border border-violet-500/20'
                        }`}
                      >
                        <div className="flex items-start space-x-2">
                          {message.sender === 'user' ? (
                            <UserIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                          ) : (
                            <SparklesIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-violet-300" />
                          )}
                          <div className="flex-1">
                            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>
                            {message.agentExecuted && (
                              <div className="mt-2 pt-2 border-t border-white/20">
                                <p className="text-xs text-white/70">
                                  Agents executed: <span className="font-semibold text-violet-300">{message.agentExecuted}</span>
                                </p>
                              </div>
                            )}
                            <p className="text-xs opacity-60 mt-2">
                              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {isProcessing && (
                  <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={fadeInUp}
                    className="flex justify-start"
                  >
                    <div className="bg-white/10 rounded-2xl p-4 border border-violet-500/20">
                      <div className="flex items-center space-x-2">
                        <SparklesIcon className="w-5 h-5 text-violet-300 animate-pulse" />
                        <span className="text-white/80">Processing...</span>
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area - Fixed at bottom */}
              <div className="p-4 border-t border-violet-500/20 bg-slate-900/60 backdrop-blur-xl flex-shrink-0 mt-auto">
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type +1000 for income, -1000 for expense, or ask a question..."
                    className="flex-1 px-4 py-3 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                    disabled={isProcessing}
                  />
                  <button
                    onClick={handleSend}
                    disabled={isProcessing || !input.trim()}
                    className="p-3 bg-gradient-to-r from-violet-600/90 to-purple-600/90 text-white rounded-xl hover:shadow-lg hover:shadow-violet-500/30 backdrop-blur-sm border border-violet-400/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                  >
                    <PaperAirplaneIcon className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-2 text-xs text-white/50">
                  <p>💡 Try: <code className="bg-white/10 px-1.5 py-0.5 rounded text-violet-300">+1000</code> to add income, <code className="bg-white/10 px-1.5 py-0.5 rounded text-violet-300">-1000</code> to add expense</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
};

export default PlaygroundPage;

