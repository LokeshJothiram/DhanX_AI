import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { EyeIcon, EyeSlashIcon, CheckCircleIcon, ArrowLeftIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { authAPI } from '../services/api';
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

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

// Password strength checker
const checkPasswordStrength = (password: string) => {
  const hasMinLength = password.length >= 8;
  const hasNumber = /[0-9]/.test(password);
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  const strength = [hasMinLength, hasNumber, hasUpperCase, hasLowerCase, hasSpecialChar].filter(Boolean).length;
  
  return {
    hasMinLength,
    hasNumber,
    hasUpperCase,
    hasLowerCase,
    hasSpecialChar,
    strength,
    isValid: strength >= 4 // At least 4 out of 5 requirements met
  };
};

const ResetPasswordConfirmPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [token, setToken] = useState('');
  const [passwordStrength, setPasswordStrength] = useState({
    hasMinLength: false,
    hasNumber: false,
    hasUpperCase: false,
    hasLowerCase: false,
    hasSpecialChar: false,
    strength: 0,
    isValid: false
  });
  const [isValidatingToken, setIsValidatingToken] = useState(true);

  useEffect(() => {
    const tokenFromUrl = searchParams.get('token');
    if (!tokenFromUrl) {
      setError('Invalid reset link. Please request a new password reset.');
      setIsValidatingToken(false);
      return;
    }
    
    // Set the token directly since we'll validate it when the form is submitted
    setToken(tokenFromUrl);
    setIsValidatingToken(false);
  }, [searchParams]);
  
  // Update password strength when password changes
  useEffect(() => {
    if (formData.password) {
      setPasswordStrength(checkPasswordStrength(formData.password));
    } else {
      setPasswordStrength({
        hasMinLength: false,
        hasNumber: false,
        hasUpperCase: false,
        hasLowerCase: false,
        hasSpecialChar: false,
        strength: 0,
        isValid: false
      });
    }
  }, [formData.password]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    // Validation
    if (!passwordStrength.isValid) {
      setError('Please ensure your password meets all the requirements');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      await authAPI.resetPassword(token, formData.password);
      setResetSuccess(true);
      setMessage('Password has been reset successfully! Redirecting to login...');
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || 'Failed to reset password. Please try again.';
      setError(errorMessage);
      
      // If token is invalid, clear it to prevent further attempts
      if (errorMessage.includes('Invalid') || errorMessage.includes('expired') || errorMessage.includes('used')) {
        setToken('');
      }
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while validating token
  if (isValidatingToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mx-auto"></div>
          <p className="mt-4 text-white/70">Verifying your reset link...</p>
        </div>
      </div>
    );
  }

  // Show success message after password reset
  if (resetSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950 to-slate-950 flex items-center justify-center p-4">
        <div className="text-center max-w-md bg-slate-900/40 backdrop-blur-2xl rounded-2xl p-8 border border-violet-500/20 shadow-xl">
          <div className="mx-auto flex items-center justify-center h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-green-500/20 backdrop-blur-sm border border-green-500/30 mb-3 sm:mb-4">
            <CheckCircleIcon className="h-5 w-5 sm:h-6 sm:w-6 text-green-400" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Password Reset Successful!</h2>
          <p className="text-sm sm:text-base text-white/70 mb-4 sm:mb-6">
            Your password has been updated successfully. You'll be redirected to the login page shortly.
          </p>
          <div className="mt-4 sm:mt-6">
            <Link
              to="/login"
              className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent text-xs sm:text-sm font-medium rounded-xl shadow-lg text-white bg-gradient-to-r from-violet-600/90 to-purple-600/90 hover:from-violet-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 backdrop-blur-sm border-violet-400/30 hover:shadow-violet-500/30 transition-all"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Show error if token is invalid
  if (!token || (error && !resetSuccess)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950 to-slate-950 flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <h2 className="mt-6 text-center text-2xl sm:text-3xl font-extrabold text-white">
            {error.includes('expired') ? 'Link Expired' : 'Invalid Reset Link'}
          </h2>
        </div>

        <div className="mt-6 sm:mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-slate-900/40 backdrop-blur-2xl py-6 sm:py-8 px-4 shadow-xl sm:rounded-2xl sm:px-6 lg:px-10 text-center border border-violet-500/20">
            <div className="mx-auto flex items-center justify-center h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-red-500/20">
              <ExclamationTriangleIcon className="h-5 w-5 sm:h-6 sm:w-6 text-red-400" aria-hidden="true" />
            </div>
            <h3 className="mt-3 text-base sm:text-lg font-medium text-white">
              {error.includes('expired') 
                ? 'This password reset link has expired'
                : 'This password reset link is invalid'}
            </h3>
            <div className="mt-2 text-xs sm:text-sm text-gray-300">
              <p>{error}</p>
            </div>
            <div className="mt-4 sm:mt-6">
              <Link
                to="/reset-password"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-xl shadow-lg text-xs sm:text-sm font-medium text-white bg-gradient-to-r from-violet-600/90 to-purple-600/90 hover:from-violet-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 backdrop-blur-sm border-violet-400/30 hover:shadow-violet-500/30 transition-all"
              >
                Request a new password reset
              </Link>
            </div>
            <div className="mt-3 sm:mt-4">
              <Link
                to="/login"
                className="text-xs sm:text-sm font-medium text-violet-400 hover:text-violet-300"
              >
                Back to login
              </Link>
            </div>
          </div>
        </div>
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
                <span className="block">Create a New</span>
                <span className="bg-gradient-to-r from-violet-300 via-purple-300 to-fuchsia-300 bg-clip-text text-transparent">Password</span>
              </motion.h1>
              
              <motion.p 
                className="text-base sm:text-lg text-gray-300 mb-6 sm:mb-8 max-w-2xl mx-auto lg:mx-0"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                Please enter your new password below. Make sure it's secure and easy for you to remember.
              </motion.p>
            </motion.div>
            
            {/* Reset Password Form */}
            <motion.div 
              initial="hidden"
              animate="visible"
              variants={fadeInUp}
              className="bg-slate-900/40 backdrop-blur-2xl rounded-2xl p-4 sm:p-6 border border-violet-500/20 shadow-xl shadow-violet-500/10"
            >
              <h2 className="text-lg sm:text-xl font-bold text-white mb-4 sm:mb-6">Reset Password</h2>
              
              {error && (
                <div className="bg-red-500/20 border border-red-500/30 backdrop-blur-sm text-red-100 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl mb-4 sm:mb-6 text-sm">
                  {error}
                </div>
              )}
              
              <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-white/80 mb-1">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={formData.password}
                      onChange={handleChange}
                      className="appearance-none block w-full px-3 py-2.5 border border-violet-500/20 bg-white/5 backdrop-blur-xl text-white rounded-xl shadow-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 text-sm transition-all"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-2.5 sm:pr-3 flex items-center"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeSlashIcon className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                      ) : (
                        <EyeIcon className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                      )}
                    </button>
                  </div>
                  {formData.password && (
                    <div className="mt-2">
                      <div className="grid grid-cols-4 gap-2 mb-2">
                        {[1, 2, 3, 4].map((i) => (
                          <div 
                            key={i}
                            className={`h-1 rounded-full ${
                              passwordStrength.strength >= i 
                                ? passwordStrength.strength >= 4 
                                  ? 'bg-green-500' 
                                  : passwordStrength.strength >= 3 
                                    ? 'bg-yellow-500' 
                                    : 'bg-red-500'
                                : 'bg-gray-700'
                            }`}
                          />
                        ))}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2 sm:gap-x-4 gap-y-1 text-xs text-gray-400">
                        <div className="flex items-center">
                          {passwordStrength.hasMinLength ? (
                            <CheckCircleIcon className="h-3 w-3 sm:h-4 sm:w-4 text-green-500 mr-1" />
                          ) : (
                            <div className="h-3 w-3 sm:h-4 sm:w-4 rounded-full border-2 border-gray-600 mr-1" />
                          )}
                          <span>8+ characters</span>
                        </div>
                        <div className="flex items-center">
                          {passwordStrength.hasNumber ? (
                            <CheckCircleIcon className="h-3 w-3 sm:h-4 sm:w-4 text-green-500 mr-1" />
                          ) : (
                            <div className="h-3 w-3 sm:h-4 sm:w-4 rounded-full border-2 border-gray-600 mr-1" />
                          )}
                          <span>Number</span>
                        </div>
                        <div className="flex items-center">
                          {passwordStrength.hasUpperCase ? (
                            <CheckCircleIcon className="h-3 w-3 sm:h-4 sm:w-4 text-green-500 mr-1" />
                          ) : (
                            <div className="h-3 w-3 sm:h-4 sm:w-4 rounded-full border-2 border-gray-600 mr-1" />
                          )}
                          <span>Uppercase</span>
                        </div>
                        <div className="flex items-center">
                          {passwordStrength.hasSpecialChar ? (
                            <CheckCircleIcon className="h-3 w-3 sm:h-4 sm:w-4 text-green-500 mr-1" />
                          ) : (
                            <div className="h-3 w-3 sm:h-4 sm:w-4 rounded-full border-2 border-gray-600 mr-1" />
                          )}
                          <span>Special char</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      className={`appearance-none block w-full px-3 py-2.5 border backdrop-blur-xl ${
                        formData.confirmPassword
                          ? formData.password === formData.confirmPassword
                            ? 'border-green-500/50 bg-green-500/10'
                            : 'border-red-500/50 bg-red-500/10'
                          : 'border-violet-500/20 bg-white/5'
                      } text-white rounded-xl shadow-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 text-sm transition-all`}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-2.5 sm:pr-3 flex items-center"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? (
                        <EyeSlashIcon className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                      ) : (
                        <EyeIcon className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                      )}
                    </button>
                  </div>
                  {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                    <p className="mt-1 text-xs sm:text-sm text-red-400">Passwords do not match</p>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading || !passwordStrength.isValid || formData.password !== formData.confirmPassword}
                    className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-lg text-sm font-medium text-white bg-gradient-to-r from-violet-600/90 via-purple-600/90 to-fuchsia-600/90 hover:from-violet-700 hover:via-purple-700 hover:to-fuchsia-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 backdrop-blur-sm border-violet-400/30 hover:shadow-violet-500/30"
                  >
                    {loading ? 'Resetting...' : 'Reset Password'}
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

export default ResetPasswordConfirmPage;
