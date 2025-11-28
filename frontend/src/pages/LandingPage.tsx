import React, { useEffect, useRef, useMemo, memo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import { motion, useAnimation, useInView } from 'framer-motion';
import { 
  ChartBarIcon,
  ShieldCheckIcon,
  ClockIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  SparklesIcon,
  UsersIcon,
  StarIcon,
  BoltIcon,
  BanknotesIcon,
  WalletIcon,
  ChartPieIcon,
  LightBulbIcon,
  DevicePhoneMobileIcon,
  Bars3Icon,
  XMarkIcon
} from '@heroicons/react/24/outline';

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } // Smooth cubic bezier
  }
};

const fadeInLeft = {
  hidden: { opacity: 0, x: -30 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] }
  }
};

const fadeInRight = {
  hidden: { opacity: 0, x: 30 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] }
  }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1
    }
  }
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
  }
};

// Professional animation variants for "Build Financial Security" section
const professionalStaggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1
    }
  }
};

const professionalCardAnimation = {
  hidden: { 
    opacity: 0, 
    y: 40,
    scale: 0.96
  },
  visible: { 
    opacity: 1, 
    y: 0,
    scale: 1,
    transition: { 
      duration: 0.8, 
      ease: [0.25, 0.46, 0.45, 0.94], // Smooth professional ease
      type: "tween"
    }
  }
};

const professionalTitleAnimation = {
  hidden: { 
    opacity: 0, 
    y: 20
  },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { 
      duration: 0.9, 
      ease: [0.22, 1, 0.36, 1] // Elegant ease-in-out
    }
  }
};

// Modern Geometric Background Animation - Ultra Modern & Unique
const ModernGeometricBackground: React.FC<{ uniqueId?: string }> = memo(({ uniqueId = '' }) => {
  const animId = useMemo(() => uniqueId || Math.random().toString(36).substring(7), [uniqueId]);
  
  // Generate geometric shapes (hexagons, circles, triangles)
  const geometricShapes = useMemo(() => {
    return Array.from({ length: 25 }, (_, i) => ({
      id: i,
      type: ['hexagon', 'circle', 'triangle'][i % 3],
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 8,
      duration: 20 + Math.random() * 15,
      size: 40 + Math.random() * 80,
      opacity: 0.03 + Math.random() * 0.08,
      rotation: Math.random() * 360,
    }));
  }, []);

  // Generate connected nodes for network effect
  const nodes = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      id: i,
      x: 10 + (i % 4) * 30 + Math.random() * 10,
      y: 10 + Math.floor(i / 4) * 30 + Math.random() * 10,
      delay: Math.random() * 3,
    }));
  }, []);

  // Generate floating glassmorphism panels with non-overlapping positions
  const glassPanels = useMemo(() => {
    const panels = [];
    const gridCols = 3; // 3 columns
    const gridRows = 3; // 3 rows
    const totalPanels = Math.min(8, gridCols * gridRows);
    const spacingX = 100 / (gridCols + 1); // Horizontal spacing
    const spacingY = 100 / (gridRows + 1); // Vertical spacing
    
    // Create a grid-based layout with some randomness
    for (let i = 0; i < totalPanels; i++) {
      const row = Math.floor(i / gridCols);
      const col = i % gridCols;
      
      // Base position on grid
      const baseLeft = spacingX * (col + 1);
      const baseTop = spacingY * (row + 1);
      
      // Add small random offset to avoid perfect grid alignment
      const offsetX = (Math.random() - 0.5) * (spacingX * 0.3);
      const offsetY = (Math.random() - 0.5) * (spacingY * 0.3);
      
      panels.push({
        id: i,
        left: Math.max(5, Math.min(95, baseLeft + offsetX)), // Clamp between 5% and 95%
        top: Math.max(5, Math.min(95, baseTop + offsetY)), // Clamp between 5% and 95%
        width: 120 + Math.random() * 80, // Smaller, more consistent sizes
        height: 80 + Math.random() * 60,
        delay: Math.random() * 5,
        duration: 25 + Math.random() * 20,
        rotation: -15 + Math.random() * 30,
      });
    }
    
    return panels;
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ willChange: 'transform', transform: 'translateZ(0)' }}>
      {/* Animated Gradient Mesh Blobs */}
      <div className="absolute inset-0">
        <motion.div
          className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(168, 85, 247, 0.15) 0%, transparent 70%)',
            filter: 'blur(80px)',
          }}
          animate={{
            x: [0, 100, -50, 0],
            y: [0, -80, 50, 0],
            scale: [1, 1.2, 0.9, 1],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, transparent 70%)',
            filter: 'blur(70px)',
          }}
          animate={{
            x: [0, -120, 80, 0],
            y: [0, 100, -60, 0],
            scale: [1, 0.8, 1.3, 1],
          }}
          transition={{
            duration: 25,
            delay: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute top-1/2 right-0 w-[400px] h-[400px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(236, 72, 153, 0.1) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
          animate={{
            x: [0, -150, 100, 0],
            y: [0, 80, -40, 0],
            scale: [1, 1.1, 0.95, 1],
          }}
          transition={{
            duration: 18,
            delay: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* Floating Glassmorphism Panels */}
      <div className="absolute inset-0">
        {glassPanels.map((panel) => (
          <motion.div
            key={`glass-${animId}-${panel.id}`}
            className="absolute rounded-2xl backdrop-blur-xl border border-violet-500/20"
            style={{
              left: `${panel.left}%`,
              top: `${panel.top}%`,
              width: `${panel.width}px`,
              height: `${panel.height}px`,
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(139, 92, 246, 0.05) 100%)',
              willChange: 'transform',
            }}
            animate={{
              y: [0, -30, 20, 0],
              x: [0, 25, -15, 0],
              rotate: [panel.rotation, panel.rotation + 5, panel.rotation - 3, panel.rotation],
              scale: [1, 1.05, 0.98, 1],
            }}
            transition={{
              duration: panel.duration,
              delay: panel.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Animated Geometric Shapes */}
      <div className="absolute inset-0">
        {geometricShapes.map((shape) => (
          <motion.div
            key={`shape-${animId}-${shape.id}`}
            className="absolute"
            style={{
              left: `${shape.left}%`,
              top: `${shape.top}%`,
              width: `${shape.size}px`,
              height: `${shape.size}px`,
              opacity: shape.opacity,
              willChange: 'transform',
            }}
            animate={{
              rotate: [shape.rotation, shape.rotation + 360],
              scale: [1, 1.2, 0.9, 1],
              y: [0, -40, 30, 0],
            }}
            transition={{
              duration: shape.duration,
              delay: shape.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            {shape.type === 'hexagon' && (
              <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <defs>
                  <linearGradient id={`hexGradient-${animId}-${shape.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity="0.4"/>
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.6"/>
          </linearGradient>
                </defs>
                <polygon
                  points="50,5 90,25 90,75 50,95 10,75 10,25"
                  fill="none"
                  stroke={`url(#hexGradient-${animId}-${shape.id})`}
                  strokeWidth="1.5"
                />
              </svg>
            )}
            {shape.type === 'circle' && (
              <div
                className="w-full h-full rounded-full border-2"
                style={{
                  borderColor: 'rgba(168, 85, 247, 0.3)',
                  background: 'radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%)',
                }}
              />
            )}
            {shape.type === 'triangle' && (
              <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <linearGradient id={`triGradient-${animId}-${shape.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ec4899" stopOpacity="0.4"/>
                    <stop offset="100%" stopColor="#a855f7" stopOpacity="0.5"/>
          </linearGradient>
                </defs>
                <polygon
                  points="50,10 90,90 10,90"
                  fill="none"
                  stroke={`url(#triGradient-${animId}-${shape.id})`}
                  strokeWidth="1.5"
                />
              </svg>
            )}
          </motion.div>
        ))}
      </div>

      {/* Connected Node Network */}
      <svg className="absolute inset-0 w-full h-full opacity-20" preserveAspectRatio="none" viewBox="0 0 100 100">
        <defs>
          <linearGradient id={`lineGradient-${animId}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0.3"/>
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.5"/>
          </linearGradient>
          <radialGradient id={`nodeGradient-${animId}`}>
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0.8"/>
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.4"/>
          </radialGradient>
        </defs>
        {nodes.map((node, i) => (
          <g key={`node-${animId}-${i}`}>
            {/* Draw connections to nearby nodes */}
            {nodes.slice(i + 1, Math.min(i + 3, nodes.length)).map((targetNode, j) => {
              const distance = Math.sqrt(
                Math.pow(node.x - targetNode.x, 2) + Math.pow(node.y - targetNode.y, 2)
              );
              if (distance < 35) {
                return (
                  <motion.line
                    key={`line-${i}-${j}`}
                    x1={`${node.x}%`}
                    y1={`${node.y}%`}
                    x2={`${targetNode.x}%`}
                    y2={`${targetNode.y}%`}
                    stroke={`url(#lineGradient-${animId})`}
                    strokeWidth="0.5"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 0.3 }}
                    transition={{
                      duration: 2,
                      delay: node.delay,
                      repeat: Infinity,
                      repeatType: "reverse",
                    }}
                  />
                );
              }
              return null;
            })}
            {/* Node point */}
            <motion.circle
              cx={`${node.x}%`}
              cy={`${node.y}%`}
              r="0.8"
              fill={`url(#nodeGradient-${animId})`}
              initial={{ scale: 0 }}
              animate={{ scale: [1, 1.3, 1] }}
              transition={{
                duration: 3,
                delay: node.delay,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </g>
        ))}
      </svg>

      {/* Modern Grid Pattern with Animated Lines */}
      <div className="absolute inset-0 opacity-[0.03]">
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <defs>
            <pattern id={`modernGrid-${animId}`} width="80" height="80" patternUnits="userSpaceOnUse">
              <motion.path
                d="M 80 0 L 0 0 0 80"
                fill="none"
                stroke="rgba(168, 85, 247, 0.4)"
                strokeWidth="0.5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 2, repeat: Infinity, repeatType: "reverse" }}
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#modernGrid-${animId})`} />
      </svg>
      </div>

      {/* Floating Particle Trails */}
      <div className="absolute inset-0">
        {Array.from({ length: 12 }, (_, i) => (
          <motion.div
            key={`particle-${animId}-${i}`}
            className="absolute w-1 h-1 rounded-full bg-violet-400/30"
            style={{
              left: `${10 + (i * 7)}%`,
              top: `${20 + (i % 3) * 30}%`,
              boxShadow: '0 0 8px rgba(168, 85, 247, 0.5)',
            }}
            animate={{
              y: [0, -200, 0],
              x: [0, Math.sin(i) * 50, 0],
              opacity: [0.3, 0.8, 0.3],
            }}
            transition={{
              duration: 15 + i * 2,
              delay: i * 0.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </div>
  );
});
ModernGeometricBackground.displayName = 'ModernGeometricBackground';

// Reusable Hero Background Component - Optimized for performance
const HeroBackground: React.FC<{ uniqueId?: string; reduced?: boolean }> = memo(({ uniqueId = '', reduced = false }) => {
  const bgId = useMemo(() => uniqueId || Math.random().toString(36).substring(7), [uniqueId]);
  
  // Reduced particle counts for better performance (60->15, 20->5)
  const sparkleCount = reduced ? 15 : 30;
  const particleCount = reduced ? 5 : 10;
  
  // Memoize particle positions to avoid recalculation
  const sparkles = useMemo(() => {
    return Array.from({ length: sparkleCount }, (_, i) => ({
      id: i,
      size: Math.random() * 4 + 1.5,
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 4,
      duration: 2 + Math.random() * 2,
    }));
  }, [sparkleCount]);
  
  const particles = useMemo(() => {
    return Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      size: Math.random() * 8 + 4,
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 3 + Math.random() * 2,
    }));
  }, [particleCount]);
  
  return (
    <>
      {/* Base gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-950 via-violet-950 to-indigo-950"></div>
      
      {/* Animated gradient orbs - Reduced blur for performance */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-violet-500/30 rounded-full blur-3xl animate-pulse" style={{ willChange: 'opacity', transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}></div>
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000" style={{ willChange: 'opacity', transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}></div>
      <div className="absolute top-1/2 left-1/3 w-[400px] h-[400px] bg-fuchsia-500/15 rounded-full blur-3xl animate-pulse delay-500" style={{ willChange: 'opacity', transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}></div>
      
      {/* Modern geometric background animation */}
      <ModernGeometricBackground uniqueId={bgId} />
      
      {/* Sparkling dots pattern - Reduced count for performance */}
      <div className="absolute inset-0 opacity-40" style={{ willChange: 'transform', transform: 'translateZ(0)' }}>
        {sparkles.map((sparkle) => (
          <div
            key={`sparkle-${bgId}-${sparkle.id}`}
            className="absolute rounded-full bg-violet-400 animate-pulse"
            style={{
              left: `${sparkle.left}%`,
              top: `${sparkle.top}%`,
              width: `${sparkle.size}px`,
              height: `${sparkle.size}px`,
              animationDelay: `${sparkle.delay}s`,
              animationDuration: `${sparkle.duration}s`,
              boxShadow: `0 0 ${sparkle.size * 3}px rgba(168, 85, 247, 1), 0 0 ${sparkle.size * 6}px rgba(139, 92, 246, 0.6)`,
              willChange: 'opacity, transform',
              transform: 'translateZ(0)',
            }}
          />
        ))}
      </div>
      
      {/* Additional glowing particles - Reduced count */}
      <div className="absolute inset-0 opacity-15" style={{ willChange: 'transform', transform: 'translateZ(0)' }}>
        {particles.map((particle) => (
          <div
            key={`particle-${bgId}-${particle.id}`}
            className="absolute rounded-full bg-gradient-to-r from-violet-400 to-purple-400 blur-sm animate-pulse"
            style={{
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              animationDelay: `${particle.delay}s`,
              animationDuration: `${particle.duration}s`,
              willChange: 'opacity, transform',
              transform: 'translateZ(0)',
            }}
          />
        ))}
      </div>
      
      {/* Grid pattern overlay */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
      </div>
    </>
  );
});
HeroBackground.displayName = 'HeroBackground';

const LandingPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const heroRef = useRef(null);
  const aiAgentsRef = useRef(null);
  const featuresRef = useRef(null);
  const howItWorksRef = useRef(null);
  const testimonialsRef = useRef(null);
  const ctaRef = useRef(null);
  
  // Detect mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Optimized useInView for mobile - use positive margins to trigger earlier
  // Desktop: negative margins for precise timing
  // Mobile: positive margins to trigger before element enters viewport (faster loading)
  const heroInView = useInView(heroRef, { once: true, margin: isMobile ? '100px' : '-100px', amount: isMobile ? 0.1 : 0.3 });
  const aiAgentsInView = useInView(aiAgentsRef, { once: true, margin: isMobile ? '150px' : '-50px', amount: isMobile ? 0.1 : 0.2 });
  const featuresInView = useInView(featuresRef, { once: true, margin: isMobile ? '150px' : '-50px', amount: isMobile ? 0.1 : 0.2 });
  const howItWorksInView = useInView(howItWorksRef, { once: true, margin: isMobile ? '150px' : '-50px', amount: isMobile ? 0.1 : 0.2 });
  const testimonialsInView = useInView(testimonialsRef, { once: true, margin: isMobile ? '150px' : '-50px', amount: isMobile ? 0.1 : 0.2 });
  const ctaInView = useInView(ctaRef, { once: true, margin: isMobile ? '150px' : '-50px', amount: isMobile ? 0.1 : 0.2 });

  const heroControls = useAnimation();
  const aiAgentsControls = useAnimation();
  const featuresControls = useAnimation();
  const howItWorksControls = useAnimation();
  const testimonialsControls = useAnimation();
  const ctaControls = useAnimation();

  // Hero section should animate immediately on load
  useEffect(() => {
    heroControls.start("visible");
  }, [heroControls]);

  useEffect(() => {
    if (aiAgentsInView) aiAgentsControls.start("visible");
  }, [aiAgentsInView, aiAgentsControls]);

  useEffect(() => {
    if (featuresInView) featuresControls.start("visible");
  }, [featuresInView, featuresControls]);

  useEffect(() => {
    if (howItWorksInView) howItWorksControls.start("visible");
  }, [howItWorksInView, howItWorksControls]);

  useEffect(() => {
    if (testimonialsInView) testimonialsControls.start("visible");
  }, [testimonialsInView, testimonialsControls]);

  useEffect(() => {
    if (ctaInView) ctaControls.start("visible");
  }, [ctaInView, ctaControls]);

  // Close mobile menu when window is resized to desktop size
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (mobileMenuOpen && !target.closest('nav')) {
        setMobileMenuOpen(false);
      }
    };
    if (mobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [mobileMenuOpen]);

  // Get user display name (first name + last name, or fallback to email)
  const getUserDisplayName = () => {
    if (!user) return '';
    if (user.first_name || user.last_name) {
      const firstName = user.first_name || '';
      const lastName = user.last_name || '';
      return `${firstName} ${lastName}`.trim();
    }
    return user.email;
  };

  // Smooth scroll function
  const scrollToSection = (ref: React.RefObject<HTMLElement>) => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setMobileMenuOpen(false); // Close mobile menu after navigation
  };

  // Four AI Agents Features
  const aiAgents = [
    {
      icon: ChartBarIcon,
      title: 'Income Pattern Agent',
      description: 'Learns your unique income cycles - whether you\'re a daily wage worker or delivery partner with weekend spikes. Adapts to irregular earning patterns.',
      gradient: 'from-violet-500 via-purple-500 to-fuchsia-500',
      bgColor: 'bg-violet-500/20',
      iconColor: 'text-violet-300'
    },
    {
      icon: ShieldCheckIcon,
      title: 'Spending Watchdog Agent',
      description: 'Analyzes transactions in real-time and intervenes before you overspend. Proactive alerts help you stay within budget.',
      gradient: 'from-purple-500 via-violet-500 to-fuchsia-500',
      bgColor: 'bg-purple-500/20',
      iconColor: 'text-purple-300'
    },
    {
      icon: LightBulbIcon,
      title: 'Goal Planner Agent',
      description: 'Creates achievable micro-savings targets like ₹50 per day and suggests investments, all in your local language.',
      gradient: 'from-fuchsia-500 via-purple-500 to-violet-500',
      bgColor: 'bg-fuchsia-500/20',
      iconColor: 'text-fuchsia-300'
    },
    {
      icon: WalletIcon,
      title: 'Emergency Fund Agent',
      description: 'Predicts dry income periods and helps build buffers. Never get caught off-guard during lean months.',
      gradient: 'from-indigo-500 via-purple-500 to-violet-500',
      bgColor: 'bg-indigo-500/20',
      iconColor: 'text-indigo-300'
    }
  ];

  const features = [
    {
      icon: DevicePhoneMobileIcon,
      title: 'UPI & Bank Integration',
      description: 'Connect directly to UPI, bank accounts, and track cash income to understand your complete financial picture.',
      gradient: 'from-violet-500 via-purple-500 to-fuchsia-500',
      bgColor: 'bg-violet-500/20',
      iconColor: 'text-violet-300'
    },
    {
      icon: UsersIcon,
      title: 'Built for Gig Workers',
      description: 'Designed specifically for delivery partners, daily wage laborers, small shop owners, and domestic workers.',
      gradient: 'from-purple-500 via-violet-500 to-indigo-500',
      bgColor: 'bg-purple-500/20',
      iconColor: 'text-purple-300'
    },
    {
      icon: BanknotesIcon,
      title: 'Local Language Support',
      description: 'Get financial advice in your language. No English required - we speak your language.',
      gradient: 'from-fuchsia-500 via-purple-500 to-violet-500',
      bgColor: 'bg-fuchsia-500/20',
      iconColor: 'text-fuchsia-300'
    },
    {
      icon: ChartPieIcon,
      title: 'Real-time Insights',
      description: 'Track spending patterns, income trends, and savings progress with beautiful, easy-to-understand visuals.',
      gradient: 'from-indigo-500 via-violet-500 to-purple-500',
      bgColor: 'bg-indigo-500/20',
      iconColor: 'text-indigo-300'
    },
    {
      icon: BanknotesIcon,
      title: 'Micro-Savings Goals',
      description: 'Start small with ₹50 per day savings. Build wealth gradually with achievable targets.',
      gradient: 'from-violet-500 via-indigo-500 to-purple-500',
      bgColor: 'bg-violet-500/20',
      iconColor: 'text-violet-300'
    },
    {
      icon: ClockIcon,
      title: '24/7 Financial Coach',
      description: 'Get instant financial guidance whenever you need it. Your AI coach is always available.',
      gradient: 'from-purple-600 via-violet-600 to-indigo-600',
      bgColor: 'bg-purple-500/20',
      iconColor: 'text-purple-300'
    }
  ];

  const stats = [
    { number: '100M+', label: 'Gig Workers in India' },
    { number: '78%', label: 'Have Zero Savings Plan' },
    { number: '₹50', label: 'Start Saving Per Day' },
    { number: '₹99', label: 'Premium Per Month' }
  ];

  const testimonials = [
    {
      name: 'Rajesh Kumar',
      role: 'Swiggy Delivery Partner',
      content: 'DhanX AI helped me save ₹2,000 in my first month! The income pattern agent understood my weekend spikes perfectly.',
      rating: 5
    },
    {
      name: 'Priya Sharma',
      role: 'Daily Wage Worker',
      content: 'I never thought I could save money. The micro-savings goals of ₹50 per day made it so easy. Now I have an emergency fund!',
      rating: 5
    },
    {
      name: 'Amit Patel',
      role: 'Small Shop Owner',
      content: 'The spending watchdog saved me from overspending multiple times. Best ₹99 I spend every month!',
      rating: 5
    }
  ];

  return (
    <div className="min-h-screen relative" style={{ willChange: 'scroll-position', overflowX: 'hidden' }}>
      {/* Single Shared Background for Entire Page */}
      <div className="fixed inset-0 z-0" style={{ willChange: 'transform', transform: 'translateZ(0)', overflow: 'visible' }}>
        <HeroBackground uniqueId="main" reduced={isMobile} />
      </div>
      
      {/* Navigation */}
      <nav className="absolute top-0 left-0 right-0 z-50">
        <div className="w-full">
          <div className="flex justify-between items-center h-16 pl-4 sm:pl-6 lg:pl-20 pr-4 sm:pr-6 lg:pr-8">
            {/* Logo, Name, and Navigation Links on Left */}
            <div className="flex items-center space-x-3 sm:space-x-4 lg:space-x-8 min-w-0">
              <Logo variant="light" />
              
              {/* Navigation Links - Desktop Only (hidden below lg breakpoint) */}
              <div className="hidden lg:flex items-center space-x-2 xl:space-x-3">
                <button
                  onClick={() => scrollToSection(featuresRef)}
                  className="text-white/90 hover:text-white px-3 py-2 rounded-xl text-sm font-medium transition-all hover:bg-white/5 backdrop-blur-sm border border-transparent hover:border-violet-500/20 whitespace-nowrap"
                >
                  Features
                </button>
                <button
                  onClick={() => scrollToSection(howItWorksRef)}
                  className="text-white/90 hover:text-white px-3 py-2 rounded-xl text-sm font-medium transition-all hover:bg-white/5 backdrop-blur-sm border border-transparent hover:border-violet-500/20 whitespace-nowrap"
                >
                  How It Works
                </button>
                <button
                  onClick={() => scrollToSection(testimonialsRef)}
                  className="text-white/90 hover:text-white px-3 py-2 rounded-xl text-sm font-medium transition-all hover:bg-white/5 backdrop-blur-sm border border-transparent hover:border-violet-500/20 whitespace-nowrap"
                >
                  Testimonials
                </button>
              </div>
            </div>
            
            {/* Auth Buttons on Right */}
            <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
              {user ? (
                <>
                  <span className="hidden xl:inline text-white/90 text-sm truncate max-w-[200px]">Welcome, {getUserDisplayName()}</span>
                  <span className="hidden lg:inline xl:hidden text-white/90 text-sm truncate max-w-[150px]">Welcome</span>
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="bg-white/5 backdrop-blur-xl text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl hover:bg-white/10 border border-violet-500/20 hover:border-violet-400/30 transition-all text-xs sm:text-sm font-medium shadow-lg shadow-violet-500/10 whitespace-nowrap"
                  >
                    Dashboard
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="hidden lg:inline text-white/90 hover:text-white px-3 py-2 rounded-xl text-sm font-medium transition-all hover:bg-white/5 backdrop-blur-sm border border-transparent hover:border-violet-500/20 whitespace-nowrap"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/signup"
                    className="bg-gradient-to-r from-violet-600/90 to-purple-600/90 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl hover:from-violet-700 hover:to-purple-700 transition-all text-xs sm:text-sm font-medium shadow-lg hover:shadow-xl shadow-violet-500/30 backdrop-blur-sm border border-violet-400/30 whitespace-nowrap"
                  >
                    <span className="hidden sm:inline">Get Started Free</span>
                    <span className="sm:hidden">Get Started</span>
                  </Link>
                </>
              )}
              
              {/* Mobile Menu Button - Show below lg breakpoint */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-xl hover:bg-white/10 text-white backdrop-blur-sm transition-all border border-transparent hover:border-violet-500/20 flex-shrink-0"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <XMarkIcon className="h-6 w-6" />
                ) : (
                  <Bars3Icon className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>
          
          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden relative bg-gradient-to-b from-purple-950/95 via-violet-950/95 to-indigo-950/95 backdrop-blur-2xl border-t border-violet-500/30 shadow-2xl shadow-violet-900/50"
            >
              {/* Subtle gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-transparent pointer-events-none"></div>
              
              <div className="relative px-4 py-4 space-y-1">
                {user && (
                  <div className="px-3 py-3 mb-2 bg-white/5 backdrop-blur-sm rounded-xl border border-violet-500/20">
                    <div className="text-white/60 text-xs mb-1">Welcome</div>
                    <div className="text-white text-sm font-medium truncate">{getUserDisplayName()}</div>
                  </div>
                )}
                <button
                  onClick={() => scrollToSection(featuresRef)}
                  className="w-full text-left text-white/90 hover:text-white px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-white/10 backdrop-blur-sm border border-violet-500/20 hover:border-violet-400/40 hover:shadow-lg hover:shadow-violet-500/20 group"
                >
                  <span className="group-hover:text-violet-200 transition-colors">Features</span>
                </button>
                <button
                  onClick={() => scrollToSection(howItWorksRef)}
                  className="w-full text-left text-white/90 hover:text-white px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-white/10 backdrop-blur-sm border border-violet-500/20 hover:border-violet-400/40 hover:shadow-lg hover:shadow-violet-500/20 group"
                >
                  <span className="group-hover:text-violet-200 transition-colors">How It Works</span>
                </button>
                <button
                  onClick={() => scrollToSection(testimonialsRef)}
                  className="w-full text-left text-white/90 hover:text-white px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-white/10 backdrop-blur-sm border border-violet-500/20 hover:border-violet-400/40 hover:shadow-lg hover:shadow-violet-500/20 group"
                >
                  <span className="group-hover:text-violet-200 transition-colors">Testimonials</span>
                </button>
                {!user && (
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block w-full text-left text-white/90 hover:text-white px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-white/10 backdrop-blur-sm border border-violet-500/20 hover:border-violet-400/40 hover:shadow-lg hover:shadow-violet-500/20 group"
                  >
                    <span className="group-hover:text-violet-200 transition-colors">Sign In</span>
                  </Link>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </nav>

      {/* Hero Section - Split Layout */}
      <section ref={heroRef} className="relative overflow-hidden min-h-screen flex items-center z-10 py-16 sm:py-20 lg:py-0 lg:h-screen lg:items-start lg:pt-20" style={{ willChange: 'transform' }}>
        <div className="relative w-full flex items-center">
          <div className="grid lg:grid-cols-2 gap-6 lg:gap-8 items-center w-full">
            {/* Left Side - Content */}
          <motion.div
            initial="hidden"
            animate={heroControls}
            variants={staggerContainer}
              className="space-y-6 sm:space-y-8 pt-4 sm:pt-6 lg:pt-8 px-4 sm:px-6 lg:px-12 xl:px-20"
            >
            <motion.h1 
              variants={fadeInUp}
                className="text-3xl sm:text-4xl md:text-5xl lg:text-5xl xl:text-6xl font-bold text-white leading-tight"
              style={{ overflow: 'visible' }}
            >
              <span className="block" style={{ lineHeight: '1.1' }}>Your Personal Financial</span>
              <span className="block bg-gradient-to-r from-violet-300 via-purple-300 to-fuchsia-300 bg-clip-text text-transparent" style={{ lineHeight: '1.1', marginTop: '0.2em' }}>
                Coach for Gig Workers
              </span>
            </motion.h1>
            
            <motion.p 
              variants={fadeInUp}
                className="text-base sm:text-lg md:text-xl lg:text-xl text-white/90 leading-relaxed max-w-2xl"
            >
              Built for India's 100 million gig workers. Get AI-powered financial coaching that adapts to your irregular income, 
              helps you save smarter, and speaks your language. Start with ₹50 per day.
            </motion.p>
            
            {/* Feature Highlights */}
            <motion.div 
              variants={fadeInUp}
              className="flex flex-wrap gap-3 pt-2"
            >
              <div className="flex items-center gap-2 bg-white/5 backdrop-blur-sm rounded-lg px-3 py-2 border border-violet-500/20">
                <CheckCircleIcon className="w-4 h-4 text-green-400" />
                <span className="text-sm text-white/90">AI-Powered</span>
              </div>
              <div className="flex items-center gap-2 bg-white/5 backdrop-blur-sm rounded-lg px-3 py-2 border border-violet-500/20">
                <CheckCircleIcon className="w-4 h-4 text-green-400" />
                <span className="text-sm text-white/90">Multi-Language</span>
              </div>
              <div className="flex items-center gap-2 bg-white/5 backdrop-blur-sm rounded-lg px-3 py-2 border border-violet-500/20">
                <CheckCircleIcon className="w-4 h-4 text-green-400" />
                <span className="text-sm text-white/90">Start ₹50/Day</span>
              </div>
            </motion.div>
            
            <motion.div 
              variants={fadeInUp}
                className="flex flex-col sm:flex-row gap-4 pt-2"
            >
              <Link
                to="/signup"
                  className="group relative bg-violet-700 text-white px-8 py-4 sm:px-10 sm:py-4 rounded-xl font-semibold text-sm sm:text-base hover:bg-violet-600 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-2xl shadow-violet-700/50 overflow-hidden inline-flex items-center justify-center w-full sm:w-auto"
              >
                  <span className="relative z-10 flex items-center">
                Start Free Today
                    <ArrowRightIcon className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </Link>
                <Link
                  to="/login"
                  className="px-8 py-4 sm:px-10 sm:py-4 rounded-xl font-semibold text-sm sm:text-base text-white/90 hover:text-white border border-white/20 hover:border-white/40 hover:bg-white/5 transition-all duration-300 inline-flex items-center justify-center backdrop-blur-sm w-full sm:w-auto"
                >
                  Log in
                  <ArrowRightIcon className="w-5 h-5 ml-2" />
              </Link>
            </motion.div>

              {/* Stats inline - Enhanced */}
            <motion.div 
              variants={fadeInUp}
                className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 pt-4"
            >
              {stats.map((stat, index) => (
                  <div key={index} className="bg-white/10 backdrop-blur-sm rounded-xl p-4 sm:p-5 border border-violet-500/30 hover:border-violet-400/50 transition-all hover:bg-white/15 group">
                    <div className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-violet-300 via-purple-300 to-fuchsia-300 bg-clip-text text-transparent group-hover:scale-105 transition-transform">
                    {stat.number}
                  </div>
                    <div className="text-white/80 text-xs sm:text-sm mt-2 leading-tight font-medium">
                    {stat.label}
                  </div>
                </div>
              ))}
            </motion.div>
          </motion.div>

            {/* Right Side - Mobile Phone Mockup */}
            <motion.div 
              initial="hidden"
              animate={heroControls}
              variants={fadeInRight}
              className="flex relative justify-center lg:justify-center mt-8 lg:mt-0 px-4 sm:px-6 lg:px-8"
              style={{ willChange: 'transform' }}
            >
              <div className="relative w-[280px] sm:w-[320px] md:w-[360px] lg:w-[380px] xl:w-[400px]">
                {/* Phone Frame */}
                <div className="relative bg-gradient-to-br from-slate-800 to-slate-900 rounded-[3rem] p-3 sm:p-3.5 shadow-2xl transform rotate-[-2deg] hover:rotate-0 transition-transform duration-500">
                  {/* Phone Screen */}
                  <div className="bg-gradient-to-br from-purple-950 via-violet-950 to-indigo-950 rounded-[2.5rem] overflow-hidden">
                    {/* Status Bar */}
                    <div className="flex justify-between items-center px-5 sm:px-6 pt-4 pb-2">
                      <span className="text-white text-xs sm:text-sm font-semibold">9:41</span>
                      <div className="flex gap-1">
                        <div className="w-4 h-2 bg-white/80 rounded-sm"></div>
                        <div className="w-4 h-2 bg-white/80 rounded-sm"></div>
                        <div className="w-4 h-2 bg-white/80 rounded-sm"></div>
                      </div>
                    </div>

                    {/* App Content */}
                    <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-4">
                      {/* Greeting */}
                      <div className="pt-2">
                        <h3 className="text-white text-base sm:text-lg font-semibold">Good morning, Rajesh</h3>
                      </div>

                      {/* Balance Card */}
                      <div className="bg-white/10 backdrop-blur-xl rounded-xl p-5 sm:p-6 border border-violet-500/20">
                        <div className="text-white/60 text-xs sm:text-sm mb-2">DhanX Balance</div>
                        <div className="text-white text-2xl sm:text-3xl font-bold mb-4">₹1,48,137.10</div>
                        <div className="flex gap-3">
                          <div className="flex-1 bg-violet-500/20 rounded-lg p-3 border border-violet-500/30">
                            <div className="text-white/60 text-[10px] sm:text-xs mb-1">This Month</div>
                            <div className="text-violet-300 text-xs sm:text-sm font-semibold">+₹12,450</div>
                          </div>
                          <div className="flex-1 bg-purple-500/20 rounded-lg p-3 border border-purple-500/30">
                            <div className="text-white/60 text-[10px] sm:text-xs mb-1">Saved</div>
                            <div className="text-purple-300 text-xs sm:text-sm font-semibold">₹8,200</div>
                          </div>
                        </div>
                      </div>

                      {/* Accounts List */}
                      <div className="space-y-3">
                        <div className="bg-white/5 backdrop-blur-xl rounded-lg p-4 border border-violet-500/20">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <div className="text-white font-semibold text-xs sm:text-sm">Emergency Fund</div>
                              <div className="text-white/60 text-[10px] sm:text-xs">Individual savings</div>
                            </div>
                            <div className="text-right">
                              <div className="text-white font-bold text-xs sm:text-sm">₹80,638.90</div>
                              <div className="text-green-400 text-[10px] sm:text-xs">On track</div>
                            </div>
                          </div>
                          <div className="h-1 bg-white/10 rounded-full overflow-hidden mt-2">
                            <div className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full" style={{ width: '87%' }}></div>
                          </div>
                        </div>

                        <div className="bg-white/5 backdrop-blur-xl rounded-lg p-4 border border-violet-500/20">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="text-white font-semibold text-xs sm:text-sm">Daily Savings</div>
                              <div className="text-white/60 text-[10px] sm:text-xs">Micro-savings goal</div>
                            </div>
                            <div className="text-right">
                              <div className="text-white font-bold text-xs sm:text-sm">₹17,032.38</div>
                              <div className="text-violet-400 text-[10px] sm:text-xs">Active</div>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white/5 backdrop-blur-xl rounded-lg p-4 border border-violet-500/20">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="text-white font-semibold text-xs sm:text-sm">Income Tracking</div>
                              <div className="text-white/60 text-[10px] sm:text-xs">This week</div>
                            </div>
                            <div className="text-right">
                              <div className="text-white font-bold text-xs sm:text-sm">₹50,460.82</div>
                              <div className="text-purple-400 text-[10px] sm:text-xs">On track</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* CTA Button */}
                      <div className="pt-2">
                        <button className="w-full bg-violet-600 text-white py-3.5 sm:py-4 rounded-lg font-semibold text-xs sm:text-sm shadow-lg hover:bg-violet-700 transition-colors">
                          Move money
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating Card - On Track Indicator */}
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 1.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ scale: 1.05, y: -5, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } }}
                  className="absolute -bottom-6 -right-6 bg-white/10 backdrop-blur-xl rounded-xl p-3 sm:p-4 border border-violet-500/20 shadow-2xl w-44 sm:w-48 z-20"
                >
                  <div className="text-white/60 text-[10px] mb-1">On track</div>
                  <div className="text-white font-bold text-sm mb-1">87% chance</div>
                  <div className="text-white/60 text-[10px] mb-1.5">of meeting your goal</div>
                  <div className="h-10 bg-gradient-to-r from-violet-500/20 to-purple-500/20 rounded-lg flex items-end justify-between p-1.5 mt-1.5">
                    {[20, 35, 45, 60, 55, 70, 85].map((height, i) => (
                      <div
                        key={i}
                        className="w-2.5 bg-gradient-to-t from-violet-500 to-purple-500 rounded-t"
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-white/60 text-[10px] mt-1.5">
                    <span>Today</span>
                    <span>2050</span>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* AI Agents Section */}
      <section ref={aiAgentsRef} className="relative py-8 sm:py-12 md:py-16 overflow-hidden z-10">
        <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 z-10">
          <motion.div
            initial="hidden"
            animate={aiAgentsControls}
            variants={staggerContainer}
            className="text-center mb-6 sm:mb-8 md:mb-12"
          >
            <motion.h2 
              variants={fadeInUp}
                className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-bold text-white mb-3 sm:mb-4 md:mb-6"
            >
              Meet Your Financial
              <span className="block bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent mt-2">AI Coaching Team</span>
            </motion.h2>
            <motion.p 
              variants={fadeInUp}
                className="text-base sm:text-lg md:text-xl text-white/70 max-w-3xl mx-auto leading-relaxed px-2"
            >
              Four specialized AI agents work together to understand your unique financial situation 
              and provide personalized guidance tailored to your income patterns.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            animate={aiAgentsControls}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6"
          >
            {aiAgents.map((agent, index) => (
              <motion.div
                key={index}
                variants={scaleIn}
                className="group relative"
                whileHover={{ y: -8, scale: 1.02 }}
                transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <div className="relative bg-slate-900/40 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 border border-violet-500/20 hover:border-violet-400/30 transition-all duration-300 hover:shadow-2xl hover:shadow-violet-500/20 overflow-hidden" style={{ willChange: 'transform', transform: 'translateZ(0)' }}>
                  {/* Gradient overlay on hover */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${agent.gradient} opacity-0 group-hover:opacity-20 transition-opacity duration-500`}></div>
                  
                  {/* Icon with glow effect */}
                  <div className={`relative inline-flex p-4 rounded-2xl ${agent.bgColor} backdrop-blur-sm mb-6 border border-violet-500/20 group-hover:scale-110 transition-transform duration-300`} style={{ willChange: 'transform' }}>
                    <agent.icon className={`w-10 h-10 ${agent.iconColor} group-hover:scale-110 transition-transform duration-300`} />
                    <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${agent.gradient} opacity-0 group-hover:opacity-30 blur-xl transition-opacity duration-300`}></div>
                </div>
                  
                  <h3 className="relative text-xl font-bold text-white mb-4 group-hover:text-violet-200 transition-colors">
                  {agent.title}
                </h3>
                  <p className="relative text-white/70 leading-relaxed text-sm">
                  {agent.description}
                </p>
                  
                  {/* Decorative corner element */}
                  <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-violet-500/20 to-transparent rounded-bl-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section ref={featuresRef} className="relative py-8 sm:py-12 md:py-16 overflow-hidden z-10">
        <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 z-10">
          <motion.div
            initial="hidden"
            animate={featuresControls}
            variants={professionalStaggerContainer}
            className="text-center mb-6 sm:mb-8 md:mb-12"
          >
            <motion.h2 
              variants={professionalTitleAnimation}
                className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-bold text-white mb-3 sm:mb-4 md:mb-6"
            >
              Everything You Need to
              <span className="block bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent mt-2">Build Financial Security</span>
            </motion.h2>
            <motion.p 
              variants={professionalTitleAnimation}
                className="text-base sm:text-lg md:text-xl text-white/70 max-w-3xl mx-auto leading-relaxed px-2"
            >
              Comprehensive financial tools designed specifically for gig workers and informal sector employees.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            animate={featuresControls}
            variants={professionalStaggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
          >
            {features.map((feature, index) => (
              <motion.div
                key={index}
                variants={professionalCardAnimation}
                className="group relative"
                whileHover={{ 
                  y: -8, 
                  scale: 1.01,
                  transition: { 
                    duration: 0.4, 
                    ease: [0.25, 0.46, 0.45, 0.94] 
                  } 
                }}
              >
                <div className="relative bg-slate-900/40 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 border border-violet-500/20 hover:border-violet-400/30 transition-all duration-300 hover:shadow-2xl hover:shadow-violet-500/20 overflow-hidden h-full" style={{ willChange: 'transform', transform: 'translateZ(0)' }}>
                  {/* Animated gradient background */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-15 transition-opacity duration-500`}></div>
                  
                  {/* Icon container with enhanced styling */}
                  <div className={`relative inline-flex p-4 rounded-2xl ${feature.bgColor} backdrop-blur-sm mb-6 border border-white/20 group-hover:border-violet-400/50 transition-all duration-300`} style={{ willChange: 'transform' }}>
                    <feature.icon className={`w-10 h-10 ${feature.iconColor} group-hover:rotate-12 transition-transform duration-300`} />
                    <div className={`absolute -inset-1 bg-gradient-to-r ${feature.gradient} opacity-0 group-hover:opacity-20 blur-md transition-opacity duration-300 rounded-2xl`}></div>
                </div>
                  
                  <h3 className="relative text-xl font-bold text-white mb-4 group-hover:text-violet-200 transition-colors">
                  {feature.title}
                </h3>
                  <p className="relative text-white/70 leading-relaxed text-sm">
                  {feature.description}
                </p>
                  
                  {/* Bottom accent line */}
                  <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* How It Works Section */}
      <section ref={howItWorksRef} className="relative py-12 md:py-16 overflow-hidden z-10">
        <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 z-10">
          <motion.div
            initial="hidden"
            animate={howItWorksControls}
            variants={staggerContainer}
            className="text-center mb-8 md:mb-12"
          >
            <motion.h2 
              variants={fadeInUp}
                className="text-3xl md:text-5xl lg:text-6xl font-bold text-white mb-4 md:mb-6"
            >
              How It Works
              <span className="block bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent mt-2">Simple Steps to Financial Freedom</span>
            </motion.h2>
            <motion.p 
              variants={fadeInUp}
              className="text-xl md:text-2xl text-white/70 max-w-4xl mx-auto leading-relaxed mb-16"
            >
              Get started in minutes and transform your financial future with personalized AI coaching.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            animate={howItWorksControls}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6"
          >
            {[
              { step: '01', title: 'Sign Up Free', description: 'Create your account in 30 seconds. No credit card required. Start with our free basic coaching plan.', icon: UsersIcon },
              { step: '02', title: 'Connect Your Accounts', description: 'Securely link your UPI, bank accounts, and track cash income. Your data is encrypted and safe.', icon: DevicePhoneMobileIcon },
              { step: '03', title: 'Get AI Insights', description: 'Our four AI agents analyze your income patterns and spending habits to provide personalized recommendations.', icon: ChartBarIcon },
              { step: '04', title: 'Build Wealth', description: 'Start saving with micro-goals, get real-time alerts, and watch your emergency fund grow month by month.', icon: WalletIcon }
            ].map((item, index) => (
              <motion.div
                key={index}
                variants={scaleIn}
                className="group relative"
                whileHover={{ y: -12, scale: 1.03 }}
                transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <div className="relative bg-slate-900/40 backdrop-blur-2xl rounded-3xl p-8 border border-violet-500/20 hover:border-violet-400/30 transition-all duration-300 hover:shadow-2xl hover:shadow-violet-500/20 overflow-hidden h-full">
                  {/* Step number with gradient */}
                  <div className="absolute top-4 right-4 text-7xl font-black bg-gradient-to-br from-violet-500/30 via-purple-500/30 to-fuchsia-500/30 bg-clip-text text-transparent opacity-50">
                    {item.step}
                  </div>
                  
                  {/* Icon with enhanced styling */}
                  <div className="relative inline-flex p-4 rounded-2xl bg-violet-500/20 backdrop-blur-sm mb-6 border border-white/20 group-hover:bg-violet-500/30 group-hover:scale-110 transition-all duration-300" style={{ willChange: 'transform' }}>
                    <item.icon className="w-10 h-10 text-violet-300 group-hover:text-violet-200 group-hover:rotate-12 transition-all duration-300" />
                    <div className="absolute -inset-1 bg-gradient-to-r from-violet-500 to-purple-500 opacity-0 group-hover:opacity-30 blur-md transition-opacity duration-300 rounded-2xl"></div>
                  </div>
                  
                  <h3 className="relative text-xl font-bold text-white mb-4 group-hover:text-violet-200 transition-colors">
                    {item.title}
                  </h3>
                  <p className="relative text-white/70 leading-relaxed text-sm">
                    {item.description}
                  </p>
                  
                  {/* Connecting line effect */}
                  {index < 3 && (
                    <div className="hidden lg:block absolute top-1/2 -right-4 w-8 h-0.5 bg-gradient-to-r from-violet-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section ref={testimonialsRef} className="relative py-12 md:py-16 overflow-hidden z-10">
        <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 z-10">
          <motion.div
            initial="hidden"
            animate={testimonialsControls}
            variants={staggerContainer}
            className="text-center mb-8 md:mb-12"
          >
            <motion.h2 
              variants={fadeInUp}
                className="text-3xl md:text-5xl lg:text-6xl font-bold text-white mb-4 md:mb-6"
            >
              Trusted by Gig Workers Across India
            </motion.h2>
            <motion.p 
              variants={fadeInUp}
                className="text-lg md:text-xl text-white/70 max-w-3xl mx-auto leading-relaxed"
            >
              See how DhanX AI is helping delivery partners, daily wage workers, and small business owners build financial security.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            animate={testimonialsControls}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6"
          >
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={index}
                variants={fadeInUp}
                className="group relative"
                whileHover={{ y: -10, scale: 1.02 }}
                transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <div className="relative bg-slate-900/40 backdrop-blur-2xl rounded-3xl p-8 shadow-xl hover:shadow-2xl hover:shadow-violet-500/20 transition-all duration-300 border border-violet-500/20 hover:border-violet-400/30 overflow-hidden h-full" style={{ willChange: 'transform', transform: 'translateZ(0)' }}>
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  
                  {/* Quote icon */}
                  <div className="absolute top-4 right-4 text-6xl text-violet-500/10 font-serif">"</div>
                  
                  <div className="relative flex items-center mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                      <StarIcon key={i} className="w-5 h-5 text-purple-400 fill-current group-hover:text-yellow-400 transition-colors" />
                  ))}
                </div>
                  
                  <p className="relative text-white/80 mb-6 italic leading-relaxed text-sm group-hover:text-white transition-colors">
                  "{testimonial.content}"
                </p>
                  
                  <div className="relative pt-4 border-t border-violet-500/20">
                    <div className="font-bold text-white text-lg mb-1">
                    {testimonial.name}
                  </div>
                    <div className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent text-sm font-medium">
                    {testimonial.role}
                  </div>
                  </div>
                  
                  {/* Corner accent */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-violet-500/20 to-transparent rounded-bl-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section ref={ctaRef} className="py-12 md:py-16 relative overflow-hidden z-10">
        <div className="relative w-full max-w-5xl mx-auto text-center px-4 sm:px-6 lg:px-8 py-12">
          <motion.div
            initial="hidden"
            animate={ctaControls}
            variants={staggerContainer}
          >
            <motion.h2 
              variants={fadeInUp}
                className="text-3xl md:text-5xl lg:text-6xl font-bold text-white mb-4 md:mb-6"
            >
              Ready to Take Control of Your Finances?
            </motion.h2>
            <motion.p 
              variants={fadeInUp}
              className="text-xl md:text-2xl text-white/90 mb-12 max-w-3xl mx-auto leading-relaxed"
            >
              Join thousands of gig workers who are building financial security with AI-powered coaching. 
              Start free today - no credit card required.
            </motion.p>
            <motion.div 
              variants={fadeInUp}
              className="flex flex-col sm:flex-row gap-4 justify-center items-center"
            >
              <Link
                to="/signup"
                className="group relative bg-violet-700 text-white px-10 py-5 rounded-xl font-semibold text-xl hover:bg-violet-600 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-2xl shadow-violet-700/50 backdrop-blur-sm overflow-hidden"
              >
                <span className="relative z-10 flex items-center">
                Start Your Free Account
                  <ArrowRightIcon className="inline-block w-6 h-6 ml-2 group-hover:translate-x-1 transition-transform" />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </Link>
              <span className="text-white/80 text-sm">
                Free basic coaching • ₹99/month premium features
              </span>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950/50 backdrop-blur-2xl border-t border-violet-500/20 text-white/70 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <Logo variant="light" />
              <p className="mt-4 text-sm text-white/60">
                AI-powered financial coaching for India's gig workers and informal sector employees.
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-violet-300 transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-violet-300 transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-violet-300 transition-colors">How It Works</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Support</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-violet-300 transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-violet-300 transition-colors">Contact Us</a></li>
                <li><a href="#" className="hover:text-violet-300 transition-colors">Privacy Policy</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-violet-300 transition-colors">About</a></li>
                <li><a href="#" className="hover:text-violet-300 transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-violet-300 transition-colors">Careers</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-violet-500/20 mt-8 pt-8 text-center text-sm text-white/60">
            <p>&copy; 2025 DhanX AI. All rights reserved. Built for India's gig workers.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
