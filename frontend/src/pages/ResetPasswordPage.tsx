import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CheckCircleIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import AuthBackground from '../components/AuthBackground';

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.6 }
  }
};

const ResetPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  
  const { resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      await resetPassword(email);
      setMessage('If the email exists, a password reset link has been sent.');
    } catch (err: any) {
      setError('Failed to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (message) {
    return (
      <div className="min-h-screen bg-purple-950">
      <motion.section 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative overflow-hidden bg-gradient-to-br from-purple-950 via-violet-950 to-indigo-950 text-white min-h-screen flex items-center"
      >
        {/* Modern animated background */}
        <AuthBackground />

          <div className="relative max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
            <motion.div 
              className="bg-slate-900/40 backdrop-blur-2xl rounded-2xl p-6 sm:p-8 border border-violet-500/20 shadow-xl shadow-violet-500/10 text-center"
              initial="hidden"
              animate="visible"
              variants={fadeInUp}
            >
              <div className="mx-auto flex items-center justify-center h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-green-500/20 mb-4 sm:mb-6">
                <CheckCircleIcon className="h-6 w-6 sm:h-8 sm:w-8 text-green-400" aria-hidden="true" />
              </div>
              
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-3 sm:mb-4">Check your email</h2>
              
              <p className="text-sm sm:text-base text-gray-300 mb-6 sm:mb-8">
                If an account with <span className="font-medium text-white">{email}</span> exists,<br></br>
                we've sent a password reset link.<br></br>
                The link will expire in 1 hour.
              </p>
              
              <div className="mt-6 sm:mt-8">
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="w-full flex justify-center items-center py-2.5 sm:py-3 px-4 sm:px-6 border border-transparent rounded-xl shadow-lg text-sm sm:text-base font-medium text-white bg-gradient-to-r from-violet-600/90 via-purple-600/90 to-fuchsia-600/90 hover:from-violet-700 hover:via-purple-700 hover:to-fuchsia-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 transition-all duration-200 backdrop-blur-sm border-violet-400/30 hover:shadow-violet-500/30"
                >
                  Back to Login
                </button>
              </div>
              
              <p className="mt-4 sm:mt-6 text-xs sm:text-sm text-gray-400">
                Didn't receive the email?{' '}
                <button
                  type="button"
                  onClick={() => setMessage('')}
                  className="font-medium text-violet-400 hover:text-violet-300"
                >
                  Resend
                </button>
              </p>
            </motion.div>
          </div>
        </motion.section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950 to-slate-950 relative overflow-hidden">
      {/* Animated background gradient orbs */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <motion.section 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative overflow-hidden text-white min-h-screen flex items-center"
      >
        {/* Modern animated background */}
        <AuthBackground />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-center lg:text-left"
            >
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-white/5 backdrop-blur-xl border border-violet-500/20 mb-6"
              >
                <span className="h-2 w-2 rounded-full bg-violet-400 mr-2"></span>
                Reset Your Password
              </motion.div>
              
              <motion.h1 
                className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-4 sm:mb-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <span className="block">Forgot Your</span>
                <span className="bg-gradient-to-r from-violet-300 via-purple-300 to-fuchsia-300 bg-clip-text text-transparent">Password?</span>
              </motion.h1>
              
              <motion.p 
                className="text-base sm:text-lg text-gray-300 mb-6 sm:mb-8 max-w-2xl mx-auto lg:mx-0"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                No worries! Just enter your email and we'll send you a link to reset your password.
              </motion.p>
              
              <motion.div 
                className="flex items-center justify-center lg:justify-start space-x-4 mt-8 lg:mt-12"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <Link to="/login" className="inline-flex items-center text-sm text-gray-300 hover:text-white">
                  <ArrowLeftIcon className="h-4 w-4 mr-1" />
                  Back to Login
                </Link>
              </motion.div>
            </motion.div>
            
            {/* Reset Password Form */}
            <motion.div 
              initial="hidden"
              animate="visible"
              variants={fadeInUp}
              className="bg-slate-900/40 backdrop-blur-2xl rounded-2xl p-6 sm:p-8 border border-violet-500/20 shadow-xl shadow-violet-500/10"
            >
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">Reset Password</h2>
              
              {error && (
                <div className="bg-red-500/20 border border-red-500/30 backdrop-blur-sm text-red-100 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl mb-4 text-sm">
                  {error}
                </div>
              )}
              
              <form className="space-y-4 sm:space-y-6" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-white/80 mb-2">
                    Email address
                  </label>
                  <div className="mt-1">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all duration-200 text-sm sm:text-base"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={loading || !email}
                    className="w-full flex justify-center items-center py-2.5 sm:py-3 px-4 sm:px-6 border border-transparent rounded-xl shadow-lg text-sm sm:text-base font-medium text-white bg-gradient-to-r from-violet-600/90 via-purple-600/90 to-fuchsia-600/90 hover:from-violet-700 hover:via-purple-700 hover:to-fuchsia-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 backdrop-blur-sm border-violet-400/30 hover:shadow-violet-500/30"
                  >
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </div>
      </motion.section>
    </div>
  );
};

export default ResetPasswordPage;
