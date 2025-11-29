import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import Logo from './Logo';
import AuthBackground from './AuthBackground';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLanguage } from '@fortawesome/free-solid-svg-icons';
import {
  HomeIcon,
  BanknotesIcon,
  ChartBarIcon,
  FlagIcon,
  ShieldCheckIcon,
  ChatBubbleLeftRightIcon,
  LinkIcon,
  ChartPieIcon,
  DocumentChartBarIcon,
  Cog6ToothIcon,
  BellIcon,
  UserCircleIcon,
  Bars3Icon,
  XMarkIcon,
  MagnifyingGlassIcon,
  ChevronRightIcon,
  CheckIcon,
  ShieldExclamationIcon,
  PlayIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [languageDropdownOpen, setLanguageDropdownOpen] = useState(false);
  const languageDropdownRefDesktop = useRef<HTMLDivElement>(null);
  const languageDropdownRefMobile = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  const languages = [
    { code: 'en' as const, name: 'English', nativeName: 'English' },
    { code: 'hi' as const, name: 'Hindi', nativeName: 'हिंदी' },
    { code: 'ta' as const, name: 'Tamil', nativeName: 'தமிழ்' },
    { code: 'te' as const, name: 'Telugu', nativeName: 'తెలుగు' },
  ];

  // Close language dropdown when clicking outside
  useEffect(() => {
    if (!languageDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const desktopRef = languageDropdownRefDesktop.current;
      const mobileRef = languageDropdownRefMobile.current;
      
      // Check if click is outside the visible dropdown container
      // Only one header is visible at a time, so check both refs
      const isOutsideDesktop = !desktopRef || !desktopRef.contains(target);
      const isOutsideMobile = !mobileRef || !mobileRef.contains(target);
      
      // Close if click is outside both (one will be null if not visible)
      if (isOutsideDesktop && isOutsideMobile) {
        setLanguageDropdownOpen(false);
      }
    };

    // Use click event instead of mousedown to avoid conflicts with button clicks
    // Add a small delay to ensure button click handlers run first
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [languageDropdownOpen]);

  const navigationSections = useMemo(() => [
    {
      title: t('common.overview'),
      items: [
        { name: t('common.dashboard'), href: '/dashboard', icon: HomeIcon },
      ],
    },
    {
      title: t('common.financial'),
      items: [
        { name: t('common.income'), href: '/income', icon: BanknotesIcon },
        { name: t('common.spending'), href: '/spending', icon: ChartBarIcon },
        { name: t('common.goals'), href: '/goals', icon: FlagIcon },
        { name: t('common.emergencyFund'), href: '/emergency-fund', icon: ShieldCheckIcon },
      ],
    },
    {
      title: t('common.toolsReports'),
      items: [
        { name: t('common.aiCoach'), href: '/coach', icon: ChatBubbleLeftRightIcon },
        { name: 'Can I Afford This?', href: '/can-i-afford-this', icon: CurrencyDollarIcon },
        { name: 'Agent Playground', href: '/playground', icon: PlayIcon },
        { name: t('common.connections'), href: '/connections', icon: LinkIcon },
        { name: t('common.investments'), href: '/investments', icon: ChartPieIcon },
        { name: t('common.reports'), href: '/reports', icon: DocumentChartBarIcon },
      ],
    },
    {
      title: t('common.settings'),
      items: [
        { name: t('common.settings'), href: '/settings', icon: Cog6ToothIcon },
        ...(isAdmin() ? [{ name: 'Admin Panel', href: '/admin', icon: ShieldExclamationIcon }] : []),
      ],
    },
  ], [t, user, isAdmin]);

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(path);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Generate breadcrumbs from pathname
  const getBreadcrumbs = () => {
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const breadcrumbs: { name: string; path: string }[] = [];

    // Map path segments to readable names
    const pathNameMap: { [key: string]: string } = {
      dashboard: t('common.dashboard'),
      income: t('common.income'),
      spending: t('common.spending'),
      goals: t('common.goals'),
      'emergency-fund': t('common.emergencyFund'),
      coach: t('common.aiCoach'),
      connections: t('common.connections'),
      investments: t('common.investments'),
      reports: t('common.reports'),
      settings: t('common.settings'),
      playground: 'Agent Playground',
      admin: 'Admin Panel',
    };

    // Always start with Home (Dashboard)
    breadcrumbs.push({ name: t('common.home'), path: '/dashboard' });

    // Build breadcrumbs from path segments (skip dashboard if present)
    let currentPath = '';
    pathSegments.forEach((segment) => {
      if (segment === 'dashboard') {
        currentPath = '/dashboard';
        return;
      }
      currentPath += `/${segment}`;
      const name = pathNameMap[segment] || segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
      breadcrumbs.push({ name, path: currentPath });
    });

    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  // Map breadcrumb names to icons
  const getBreadcrumbIcon = (name: string) => {
    const iconMap: { [key: string]: React.ComponentType<{ className?: string }> } = {
      [t('common.home')]: HomeIcon,
      [t('common.dashboard')]: HomeIcon,
      [t('common.income')]: BanknotesIcon,
      [t('common.spending')]: ChartBarIcon,
      [t('common.goals')]: FlagIcon,
      [t('common.emergencyFund')]: ShieldCheckIcon,
      [t('common.aiCoach')]: ChatBubbleLeftRightIcon,
      [t('common.connections')]: LinkIcon,
      [t('common.investments')]: ChartPieIcon,
      [t('common.reports')]: DocumentChartBarIcon,
      [t('common.settings')]: Cog6ToothIcon,
      'Agent Playground': PlayIcon,
      'Admin Panel': ShieldExclamationIcon,
    };
    return iconMap[name];
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Fixed background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-violet-950 to-slate-950 pointer-events-none z-0"></div>
      
      {/* Animated background gradient orbs */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      {/* Modern animated background */}
      <AuthBackground />

      {/* Mobile sidebar backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-40 lg:hidden"
            />
            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 w-64 border-r border-violet-500/10 lg:hidden"
            >
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between p-4 border-b border-violet-500/10">
                  <Logo variant="light" />
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-2 rounded-xl hover:bg-white/10 text-white backdrop-blur-sm transition-all"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
                <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto scrollbar-hide">
                  {navigationSections.map((section) => (
                    <div key={section.title}>
                      <h3 className="px-3 mb-1.5 text-xs font-semibold text-white/40 uppercase tracking-wider">
                        {section.title}
                      </h3>
                      <div className="space-y-0.5">
                        {section.items.map((item) => {
                          const active = isActive(item.href);
                          return (
                            <Link
                              key={item.name}
                              to={item.href}
                              onClick={() => setSidebarOpen(false)}
                              className={`group flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-all duration-300 ${
                                active
                                  ? 'bg-gradient-to-r from-violet-600/90 via-purple-600/90 to-fuchsia-600/90 text-white shadow-lg shadow-violet-500/20 backdrop-blur-xl border border-violet-400/30'
                                  : 'text-white/60 hover:text-white hover:bg-white/5'
                              }`}
                            >
                              <item.icon className={`h-4 w-4 transition-transform ${active ? 'scale-110' : 'group-hover:scale-110'}`} />
                              <span className="text-xs font-medium">{item.name}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </nav>
                
                {/* Profile section at bottom */}
                <div className="p-3 border-t border-violet-500/10">
                  <div className="relative">
                    <button
                      onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                      className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-all text-white/80 hover:text-white"
                    >
                      <UserCircleIcon className="h-5 w-5" />
                      <span className="text-sm font-medium flex-1 text-left">{user?.first_name || user?.email}</span>
                    </button>

                    <AnimatePresence>
                      {profileDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.95 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="absolute bottom-full left-0 right-0 mb-2 bg-slate-900/40 backdrop-blur-2xl rounded-2xl border border-violet-500/30 shadow-2xl shadow-violet-500/10 overflow-hidden"
                        >
                          <div className="p-3 border-b border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-transparent">
                            <div className="flex items-center justify-between mb-1.5">
                        <p className="text-sm font-semibold text-white truncate">{user?.first_name || t('common.user')}</p>
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-gradient-to-r from-violet-500/30 to-purple-500/30 text-violet-200 rounded-md backdrop-blur-sm border border-violet-400/20">
                          {user?.subscription_status === 'premium' ? t('common.premium') : t('common.free')}
                        </span>
                            </div>
                            <p className="text-xs text-white/50 truncate">{user?.email}</p>
                          </div>
                          <div className="p-1.5">
                            <Link
                              to="/settings"
                              onClick={() => setProfileDropdownOpen(false)}
                              className="flex items-center px-3 py-2 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200"
                            >
                              {t('common.settings')}
                            </Link>
                            <button
                              onClick={handleLogout}
                              className="w-full flex items-center px-3 py-2 text-xs font-medium text-white/70 hover:text-white hover:bg-red-500/10 rounded-lg transition-all duration-200 mt-0.5"
                            >
                              {t('common.signOut')}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop floating sidebar */}
      <motion.div
        initial={false}
        animate={{
          width: sidebarExpanded ? 256 : 80,
        }}
        transition={{ 
          type: "spring",
          stiffness: 260,
          damping: 25,
          mass: 0.8
        }}
        className="hidden lg:fixed lg:top-2 lg:left-2 lg:bottom-2 lg:z-50 lg:flex lg:flex-col"
      >
        <div
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className="flex flex-col flex-grow bg-slate-900/40 backdrop-blur-xl rounded-2xl shadow-2xl border border-violet-500/20 overflow-hidden cursor-pointer hover:border-violet-400/30 transition-all h-full"
        >
          {/* Header with logo */}
          <div className={`flex items-center h-16 px-4 border-b border-violet-500/20 ${
            sidebarExpanded ? 'justify-start' : 'justify-center'
          }`}>
            {sidebarExpanded ? (
              <Logo variant="light" />
            ) : (
              <div className="w-8 h-8 flex items-center justify-center">
                <svg 
                  width="32" 
                  height="32" 
                  viewBox="0 0 32 32" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-8 h-8"
                >
                  <rect width="32" height="32" rx="8" fill="#6D28D9"/>
                  <circle cx="16" cy="16" r="9" fill="white" opacity="0.15"/>
                  <circle cx="16" cy="16" r="7" fill="white" opacity="0.25"/>
                  <path d="M12 20L16 12L20 20" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  <path d="M16 12V24" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                </svg>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto scrollbar-hide">
            {navigationSections.map((section) => (
              <div key={section.title}>
                {sidebarExpanded && (
                  <h3 className="px-3 mb-1.5 text-xs font-semibold text-white/40 uppercase tracking-wider">
                    {section.title}
                  </h3>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.name}
                        to={item.href}
                        onClick={(e) => {
                          e.stopPropagation();
                          // Expand sidebar if it's collapsed
                          if (!sidebarExpanded) {
                            setSidebarExpanded(true);
                          }
                        }}
                        className={`group relative flex items-center ${
                          sidebarExpanded ? 'px-3 space-x-3' : 'px-3 justify-center'
                        } py-1.5 rounded-lg transition-all duration-200 ${
                          active
                            ? 'bg-gradient-to-r from-violet-600/90 via-purple-600/90 to-fuchsia-600/90 text-white shadow-lg shadow-violet-500/20 backdrop-blur-xl border border-violet-400/30'
                            : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                        title={!sidebarExpanded ? item.name : undefined}
                      >
                        <item.icon className={`h-5 w-5 flex-shrink-0 ${active ? 'text-white' : 'text-white/60 group-hover:text-white'}`} />
                        {sidebarExpanded && (
                          <span className="text-xs font-medium">{item.name}</span>
                        )}
                        {!sidebarExpanded && (
                          <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                            {item.name}
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          
          {/* Profile section at bottom */}
          <div className="p-3 border-t border-violet-500/20" onClick={(e) => e.stopPropagation()}>
            <div className="relative">
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className={`group relative w-full flex items-center ${
                  sidebarExpanded ? 'px-3 space-x-2' : 'px-3 justify-center'
                } py-2 rounded-lg hover:bg-white/5 transition-all text-white/80 hover:text-white`}
                title={!sidebarExpanded ? user?.first_name || user?.email : undefined}
              >
                <UserCircleIcon className="h-5 w-5 flex-shrink-0 text-white/60" />
                {sidebarExpanded && (
                  <span className="text-sm font-medium flex-1 text-left truncate">
                    {user?.first_name || user?.email}
                  </span>
                )}
                {!sidebarExpanded && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                    {user?.first_name || user?.email}
                  </div>
                )}
              </button>

              <AnimatePresence>
                {profileDropdownOpen && sidebarExpanded && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="absolute bottom-full left-0 right-0 mb-2 bg-slate-900/95 backdrop-blur-xl rounded-xl border border-violet-500/30 shadow-xl overflow-hidden"
                  >
                    <div className="p-3 border-b border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-transparent">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-sm font-semibold text-white truncate">{user?.first_name || t('common.user')}</p>
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-gradient-to-r from-violet-500/30 to-purple-500/30 text-violet-200 rounded-md backdrop-blur-sm border border-violet-400/20">
                          {user?.subscription_status === 'premium' ? t('common.premium') : t('common.free')}
                        </span>
                      </div>
                      <p className="text-xs text-white/50 truncate">{user?.email}</p>
                    </div>
                    <div className="p-1.5">
                      <Link
                        to="/settings"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center px-3 py-2 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200"
                      >
                        {t('common.settings')}
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center px-3 py-2 text-xs font-medium text-white/70 hover:text-white hover:bg-red-500/10 rounded-lg transition-all duration-200 mt-0.5"
                      >
                        {t('common.signOut')}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main content */}
      <div className="relative z-10">
        {/* Desktop version with animated padding */}
        <motion.div 
          initial={false}
          animate={{
            paddingLeft: sidebarExpanded ? 272 : 96,
          }}
          transition={{ 
            type: "spring",
            stiffness: 260,
            damping: 25,
            mass: 0.8
          }}
          className="hidden lg:block"
        >
          {/* Top header */}
          <header className="sticky top-0 z-30 border-b border-violet-500/10">
            <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
              {/* Left side - Breadcrumbs */}
              <div className="flex items-center space-x-4">
                {/* Breadcrumbs */}
                <nav className="flex items-center space-x-2 text-sm">
                  {breadcrumbs.map((crumb, index) => (
                    <React.Fragment key={crumb.path}>
                      {index > 0 && (
                        <ChevronRightIcon className="h-3.5 w-3.5 text-white/30" />
                      )}
                      {index === breadcrumbs.length - 1 ? (
                        <span className="flex items-center space-x-1.5 text-white font-semibold">
                          {(() => {
                            const Icon = getBreadcrumbIcon(crumb.name);
                            return Icon ? <Icon className="h-4 w-4" /> : null;
                          })()}
                          <span>{crumb.name}</span>
                        </span>
                      ) : (
                        <Link
                          to={crumb.path}
                          className="flex items-center space-x-1.5 text-white/60 hover:text-white transition-colors duration-200 font-medium"
                        >
                          {(() => {
                            const Icon = getBreadcrumbIcon(crumb.name);
                            return Icon ? <Icon className="h-4 w-4" /> : null;
                          })()}
                          <span>{crumb.name}</span>
                        </Link>
                      )}
                    </React.Fragment>
                  ))}
                </nav>
              </div>

              {/* Right side actions */}
              <div className="flex items-center space-x-2 sm:space-x-4 ml-auto">
                {/* Search bar */}
                <div className="hidden md:flex">
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-violet-400/60" />
                    <input
                      type="text"
                      placeholder={t('common.search')}
                      className="w-64 pl-10 pr-4 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                    />
                  </div>
                </div>

                {/* Language selector */}
                <div className="relative z-50" ref={languageDropdownRefDesktop}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLanguageDropdownOpen((prev) => !prev);
                    }}
                    className="flex items-center space-x-2 px-3 py-2 rounded-xl hover:bg-white/10 text-white relative backdrop-blur-sm transition-all border border-transparent hover:border-violet-500/20"
                    title={t('common.changeLanguage')}
                  >
                    <FontAwesomeIcon icon={faLanguage} className="h-5 w-5" />
                    <span className="text-sm font-medium hidden sm:inline">
                      {languages.find(l => l.code === language)?.nativeName || 'EN'}
                    </span>
                  </button>
                  
                  {languageDropdownOpen && (
                    <div 
                      className="absolute right-0 mt-2 w-48 bg-slate-900/95 backdrop-blur-2xl rounded-xl border border-violet-500/20 shadow-xl z-[60] overflow-hidden"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="p-2">
                        {languages.map((lang) => (
                          <button
                            key={lang.code}
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              await setLanguage(lang.code);
                              setLanguageDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 rounded-lg transition-all flex items-center justify-between ${
                              language === lang.code
                                ? 'bg-violet-600/30 text-white'
                                : 'text-white/70 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <div>
                              <div className="font-medium">{lang.nativeName}</div>
                              <div className="text-xs text-white/50">{lang.name}</div>
                            </div>
                            {language === lang.code && (
                              <CheckIcon className="h-5 w-5 text-violet-400" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Notifications */}
                <button className="p-2 rounded-xl hover:bg-white/10 text-white relative backdrop-blur-sm transition-all border border-transparent hover:border-violet-500/20">
                  <BellIcon className="h-5 w-5" />
                  <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full ring-2 ring-slate-900"></span>
                </button>

                {/* User name only */}
                <div className="text-sm font-medium text-white">
                  {user?.first_name || user?.email}
                </div>
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </motion.div>

        {/* Mobile version without padding */}
        <div className="lg:hidden">
          {/* Top header */}
          <header className="sticky top-0 z-30 border-b border-violet-500/10">
            <div className="flex items-center justify-between h-16 px-4 sm:px-6">
              {/* Left side - Mobile menu button and Breadcrumbs */}
              <div className="flex items-center space-x-4">
                {/* Mobile menu button */}
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="p-2 rounded-xl hover:bg-white/10 text-white backdrop-blur-sm transition-all"
                >
                  <Bars3Icon className="h-6 w-6" />
                </button>

                {/* Breadcrumbs */}
                <nav className="hidden md:flex items-center space-x-2 text-sm">
                  {breadcrumbs.map((crumb, index) => (
                    <React.Fragment key={crumb.path}>
                      {index > 0 && (
                        <ChevronRightIcon className="h-3.5 w-3.5 text-white/30" />
                      )}
                      {index === breadcrumbs.length - 1 ? (
                        <span className="flex items-center space-x-1.5 text-white font-semibold">
                          {(() => {
                            const Icon = getBreadcrumbIcon(crumb.name);
                            return Icon ? <Icon className="h-4 w-4" /> : null;
                          })()}
                          <span>{crumb.name}</span>
                        </span>
                      ) : (
                        <Link
                          to={crumb.path}
                          className="flex items-center space-x-1.5 text-white/60 hover:text-white transition-colors duration-200 font-medium"
                        >
                          {(() => {
                            const Icon = getBreadcrumbIcon(crumb.name);
                            return Icon ? <Icon className="h-4 w-4" /> : null;
                          })()}
                          <span>{crumb.name}</span>
                        </Link>
                      )}
                    </React.Fragment>
                  ))}
                </nav>
              </div>

              {/* Right side actions */}
              <div className="flex items-center space-x-2 sm:space-x-4 ml-auto">
                {/* Search bar - hidden on mobile */}
                <div className="hidden md:flex">
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-violet-400/60" />
                    <input
                      type="text"
                      placeholder={t('common.search')}
                      className="w-64 pl-10 pr-4 py-2.5 bg-white/5 backdrop-blur-xl border border-violet-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                    />
                  </div>
                </div>

                {/* Language selector */}
                <div className="relative z-50" ref={languageDropdownRefMobile}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLanguageDropdownOpen((prev) => !prev);
                    }}
                    className="flex items-center space-x-2 px-3 py-2 rounded-xl hover:bg-white/10 text-white relative backdrop-blur-sm transition-all border border-transparent hover:border-violet-500/20"
                    title={t('common.changeLanguage')}
                  >
                    <FontAwesomeIcon icon={faLanguage} className="h-5 w-5" />
                    <span className="text-sm font-medium hidden sm:inline">
                      {languages.find(l => l.code === language)?.nativeName || 'EN'}
                    </span>
                  </button>
                  
                  {languageDropdownOpen && (
                    <div 
                      className="absolute right-0 mt-2 w-48 bg-slate-900/95 backdrop-blur-2xl rounded-xl border border-violet-500/20 shadow-xl z-[60] overflow-hidden"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="p-2">
                        {languages.map((lang) => (
                          <button
                            key={lang.code}
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              await setLanguage(lang.code);
                              setLanguageDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 rounded-lg transition-all flex items-center justify-between ${
                              language === lang.code
                                ? 'bg-violet-600/30 text-white'
                                : 'text-white/70 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <div>
                              <div className="font-medium">{lang.nativeName}</div>
                              <div className="text-xs text-white/50">{lang.name}</div>
                            </div>
                            {language === lang.code && (
                              <CheckIcon className="h-5 w-5 text-violet-400" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Notifications */}
                <button className="p-2 rounded-xl hover:bg-white/10 text-white relative backdrop-blur-sm transition-all border border-transparent hover:border-violet-500/20">
                  <BellIcon className="h-5 w-5" />
                  <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full ring-2 ring-slate-900"></span>
                </button>

                {/* User name only */}
                <div className="text-sm font-medium text-white">
                  {user?.first_name || user?.email}
                </div>
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="p-4 sm:p-6">
            {children}
          </main>
        </div>
      </div>

      {/* Click outside to close dropdowns */}
      {profileDropdownOpen && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => {
            setProfileDropdownOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default DashboardLayout;

