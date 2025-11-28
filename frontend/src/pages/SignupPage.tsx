import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { EyeIcon, EyeSlashIcon, CheckCircleIcon, ArrowRightIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { authAPI } from '../services/api';
import { motion, useAnimation, useInView } from 'framer-motion';
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

const SignupPage: React.FC = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ checking: boolean; available?: boolean }>({ checking: false });
  const [isTouched, setIsTouched] = useState({
    email: false,
    password: false
  });

  const { signup, login } = useAuth();
  const navigate = useNavigate();
  
  const controls = useAnimation();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  useEffect(() => {
    if (isInView) {
      controls.start('visible');
    }
  }, [controls, isInView]);

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

  const [passwordStrength, setPasswordStrength] = useState({
    hasMinLength: false,
    hasNumber: false,
    hasUpperCase: false,
    hasLowerCase: false,
    hasSpecialChar: false,
    strength: 0,
    isValid: false
  });

  // Check email availability
  const checkEmailAvailability = async (email: string) => {
    if (!email) return;

    setEmailStatus({ checking: true });
    try {
      const response = await authAPI.checkEmail(email);
      setEmailStatus({ checking: false, available: response.available });
      return response.available;
    } catch (error) {
      console.error('Error checking email:', error);
      setEmailStatus({ checking: false });
      return false;
    }
  };

  // Debounced email check
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.email && isTouched.email) {
        checkEmailAvailability(formData.email);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.email, isTouched.email]);

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
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });

    // Mark field as touched
    if (name === 'email' || name === 'password') {
      setIsTouched(prev => ({
        ...prev,
        [name]: true
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsTouched({
      email: true,
      password: true
    });

    // Check if email is available
    const isEmailAvailable = await checkEmailAvailability(formData.email);
    if (!isEmailAvailable) {
      setError('This email is already registered');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!passwordStrength.isValid) {
      setError('Please ensure your password meets all the requirements');
      return;
    }

    setLoading(true);

    try {
      // First, create the user account
      await signup(
        formData.email,
        formData.password,
        formData.firstName,
        formData.lastName
      );
      
      // Then log the user in automatically
      await login(formData.email, formData.password);
      
      // Navigate to dashboard after successful login
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Signup error:', err);
      setError(err.response?.data?.detail || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
                Get Started with DhanX AI
              </motion.div>
              
              <motion.h1 
                className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-4 sm:mb-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <span className="block">Start Your Financial</span>
                <span className="bg-gradient-to-r from-violet-300 via-purple-300 to-fuchsia-300 bg-clip-text text-transparent">Journey Today</span>
              </motion.h1>
              
              <motion.p 
                className="text-base sm:text-lg text-gray-300 mb-6 sm:mb-8 max-w-2xl mx-auto lg:mx-0"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                Join thousands of gig workers building financial security with AI-powered coaching. Start saving ₹50 per day and take control of your finances.
              </motion.p>
              
              <motion.div 
                className="flex items-center justify-center lg:justify-start space-x-4 mt-8 lg:mt-12"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <Link to="/" className="inline-flex items-center text-sm text-gray-300 hover:text-white">
                  <ArrowLeftIcon className="h-4 w-4 mr-1" />
                  Back to Home
                </Link>
              </motion.div>
            </motion.div>
            
            {/* Signup Form */}
            <motion.div 
              ref={ref}
              initial="hidden"
              animate={controls}
              variants={fadeInUp}
              className="bg-slate-900/40 backdrop-blur-2xl rounded-2xl p-4 sm:p-6 border border-violet-500/20 shadow-xl shadow-violet-500/10"
            >
              <h2 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4">Create Account</h2>
              
              <form className="space-y-3 sm:space-y-4" onSubmit={handleSubmit}>
                {error && (
                  <div className="bg-red-500/20 border border-red-500/30 backdrop-blur-sm text-red-100 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl text-sm">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="firstName" className="block text-xs font-medium text-gray-300 mb-0.5">
                      First name
                    </label>
                    <div className="mt-0.5">
                      <input
                        id="firstName"
                        name="firstName"
                        type="text"
                        value={formData.firstName}
                        onChange={handleChange}
                        className="w-full px-3 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all duration-200 text-sm"
                        autoComplete="given-name"
                        required
                        placeholder="John"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="lastName"
                      className="block text-xs font-medium text-gray-300 mb-0.5"
                    >
                      Last name
                    </label>
                    <div className="mt-0.5">
                      <input
                        id="lastName"
                        name="lastName"
                        type="text"
                        autoComplete="family-name"
                        value={formData.lastName}
                        onChange={handleChange}
                        required
                        className="w-full px-3 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all duration-200 text-sm"
                        placeholder="Doe"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="block text-xs font-medium text-gray-300 mb-0.5"
                  >
                    Email address
                  </label>
                  <div className="mt-1 relative">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="username"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      onBlur={() => setIsTouched({ ...isTouched, email: true })}
                      className="w-full px-3 sm:px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all duration-200 pr-10 sm:pr-12 text-sm"
                      placeholder="you@example.com"
                    />
                    {isTouched.email && (
                      <div className="absolute inset-y-0 right-0 pr-2.5 sm:pr-3 flex items-center">
                        {emailStatus.checking ? (
                          <svg
                            className="animate-spin h-4 w-4 sm:h-5 sm:w-5 text-gray-400"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                        ) : emailStatus.available === true ? (
                          <CheckCircleIcon className="h-4 w-4 sm:h-5 sm:w-5 text-green-400" />
                        ) : emailStatus.available === false ? (
                          <svg
                            className="h-4 w-4 sm:h-5 sm:w-5 text-red-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        ) : null}
                      </div>
                    )}
                  </div>
                  {isTouched.email && emailStatus.available === false && (
                    <p className="mt-1 text-xs sm:text-sm text-red-300">
                      This email is already registered
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="password"
                      className="block text-xs font-medium text-gray-300 mb-0.5"
                    >
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-xs text-violet-400 hover:text-violet-300"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div className="mt-1 relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={formData.password}
                      onChange={handleChange}
                      onFocus={() => setIsTouched({ ...isTouched, password: true })}
                      className="w-full px-3 sm:px-4 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all duration-200 pr-10 sm:pr-12 text-sm"
                      placeholder="••••••••"
                    />
                  </div>

                  {isTouched.password && (
                    <div className="mt-2 space-y-2">
                      <div className="grid grid-cols-4 gap-2">
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className={`h-1 rounded-full ${
                              passwordStrength.strength >= i
                                ? passwordStrength.isValid
                                  ? 'bg-green-400'
                                  : 'bg-yellow-400'
                                : 'bg-white/20'
                            }`}
                          />
                        ))}
                      </div>
                      <div className="text-xs text-gray-300 space-y-1">
                        <p
                          className={`flex items-center ${
                            passwordStrength.hasMinLength
                              ? 'text-green-400'
                              : 'text-gray-400'
                          }`}
                        >
                          <CheckCircleIcon
                            className={`h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 ${
                              passwordStrength.hasMinLength
                                ? 'text-green-400'
                                : 'text-gray-500'
                            }`}
                          />
                          At least 8 characters
                        </p>
                        <p
                          className={`flex items-center ${
                            passwordStrength.hasNumber
                              ? 'text-green-400'
                              : 'text-gray-400'
                          }`}
                        >
                          <CheckCircleIcon
                            className={`h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 ${
                              passwordStrength.hasNumber
                                ? 'text-green-400'
                                : 'text-gray-500'
                            }`}
                          />
                          At least one number
                        </p>
                        <p
                          className={`flex items-center ${
                            passwordStrength.hasUpperCase
                              ? 'text-green-400'
                              : 'text-gray-400'
                          }`}
                        >
                          <CheckCircleIcon
                            className={`h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 ${
                              passwordStrength.hasUpperCase
                                ? 'text-green-400'
                                : 'text-gray-500'
                            }`}
                          />
                          At least one uppercase letter
                        </p>
                        <p
                          className={`flex items-center ${
                            passwordStrength.hasLowerCase
                              ? 'text-green-400'
                              : 'text-gray-400'
                          }`}
                        >
                          <CheckCircleIcon
                            className={`h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 ${
                              passwordStrength.hasLowerCase
                                ? 'text-green-400'
                                : 'text-gray-500'
                            }`}
                          />
                          At least one lowercase letter
                        </p>
                        <p
                          className={`flex items-center ${
                            passwordStrength.hasSpecialChar
                              ? 'text-green-400'
                              : 'text-gray-400'
                          }`}
                        >
                          <CheckCircleIcon
                            className={`h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 ${
                              passwordStrength.hasSpecialChar
                                ? 'text-green-400'
                                : 'text-gray-500'
                            }`}
                          />
                          At least one special character
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="confirmPassword"
                      className="block text-xs font-medium text-gray-300 mb-0.5"
                    >
                      Confirm Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="text-xs text-violet-400 hover:text-violet-300"
                    >
                      {showConfirmPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div className="mt-1">
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all duration-200 text-sm"
                      placeholder="••••••••"
                    />
                  </div>
                  {formData.password &&
                    formData.confirmPassword &&
                    formData.password !== formData.confirmPassword && (
                      <p className="mt-1 text-xs sm:text-sm text-red-300">
                        Passwords do not match
                      </p>
                    )}
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={
                      loading ||
                      !formData.email ||
                      !formData.password ||
                      !formData.confirmPassword ||
                      !formData.firstName ||
                      !formData.lastName ||
                      !passwordStrength.isValid ||
                      formData.password !== formData.confirmPassword
                    }
                    className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-lg text-sm font-medium text-white bg-gradient-to-r from-violet-600/90 via-purple-600/90 to-fuchsia-600/90 hover:from-violet-700 hover:via-purple-700 hover:to-fuchsia-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 backdrop-blur-sm border-violet-400/30 hover:shadow-violet-500/30"
                  >
                    {loading ? (
                      'Creating account...'
                    ) : (
                      'Create Account'
                    )}
                  </button>
                </div>
              </form>

              <div className="mt-6 sm:mt-8 border-t border-white/10 pt-4 sm:pt-6 text-center">
                <p className="text-xs sm:text-sm text-gray-400">
                  Already have an account?{' '}
                  <Link to="/login" className="font-medium text-violet-400 hover:text-violet-300">
                    Sign in
                  </Link>
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  By signing up, you agree to our Terms of Service and Privacy Policy.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.section>
    </div>
  );
};

export default SignupPage;
