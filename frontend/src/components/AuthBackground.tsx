import React, { useMemo, memo } from 'react';
import { motion } from 'framer-motion';

const AuthBackground: React.FC = memo(() => {
  // Generate animated mesh gradient blobs (fluid-like shapes)
  const meshBlobs = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => ({
      id: i,
      left: 10 + Math.random() * 80,
      top: 10 + Math.random() * 80,
      size: 300 + Math.random() * 400,
      delay: Math.random() * 3,
      duration: 20 + Math.random() * 15,
      colorIndex: i % 3,
    }));
  }, []);

  // Generate floating particles with trails
  const particles = useMemo(() => {
    return Array.from({ length: 15 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: 3 + Math.random() * 4,
      delay: Math.random() * 5,
      duration: 8 + Math.random() * 12,
      trailLength: 20 + Math.random() * 30,
    }));
  }, []);

  // Color schemes for mesh blobs
  const blobColors = [
    {
      start: 'rgba(139, 92, 246, 0.4)',
      middle: 'rgba(168, 85, 247, 0.3)',
      end: 'rgba(236, 72, 153, 0.2)',
    },
    {
      start: 'rgba(124, 58, 237, 0.4)',
      middle: 'rgba(139, 92, 246, 0.3)',
      end: 'rgba(168, 85, 247, 0.2)',
    },
    {
      start: 'rgba(236, 72, 153, 0.4)',
      middle: 'rgba(168, 85, 247, 0.3)',
      end: 'rgba(124, 58, 237, 0.2)',
    },
  ];

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" style={{ willChange: 'transform', transform: 'translateZ(0)' }}>
      {/* Animated Mesh Gradient Blobs */}
      <div className="absolute inset-0">
        {meshBlobs.map((blob) => {
          const colors = blobColors[blob.colorIndex];
          return (
            <motion.div
              key={`blob-${blob.id}`}
              className="absolute rounded-full"
              style={{
                left: `${blob.left}%`,
                top: `${blob.top}%`,
                width: `${blob.size}px`,
                height: `${blob.size}px`,
                background: `radial-gradient(circle, ${colors.start} 0%, ${colors.middle} 40%, ${colors.end} 70%, transparent 100%)`,
                filter: 'blur(80px)',
                willChange: 'transform',
                mixBlendMode: 'screen',
              }}
              animate={{
                x: [
                  0,
                  Math.sin(blob.id * 0.5) * 100,
                  Math.cos(blob.id * 0.7) * 80,
                  -Math.sin(blob.id * 0.3) * 60,
                  0,
                ],
                y: [
                  0,
                  Math.cos(blob.id * 0.5) * 80,
                  -Math.sin(blob.id * 0.7) * 100,
                  Math.cos(blob.id * 0.3) * 70,
                  0,
                ],
                scale: [1, 1.3, 0.8, 1.1, 1],
                opacity: [0.3, 0.5, 0.4, 0.45, 0.3],
              }}
              transition={{
                duration: blob.duration,
                delay: blob.delay,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          );
        })}
      </div>

      {/* Floating Particles with Trails */}
      <div className="absolute inset-0">
        {particles.map((particle) => (
          <motion.div
            key={`particle-${particle.id}`}
            className="absolute rounded-full"
            style={{
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              background: 'radial-gradient(circle, rgba(168, 85, 247, 0.9) 0%, rgba(139, 92, 246, 0.6) 50%, transparent 100%)',
              boxShadow: `0 0 ${particle.trailLength}px rgba(168, 85, 247, 0.8), 0 0 ${particle.trailLength * 2}px rgba(139, 92, 246, 0.4)`,
              willChange: 'transform',
            }}
            animate={{
              x: [
                0,
                Math.sin(particle.id) * 150,
                Math.cos(particle.id * 1.3) * 120,
                -Math.sin(particle.id * 0.7) * 100,
                0,
              ],
              y: [
                0,
                Math.cos(particle.id) * 120,
                -Math.sin(particle.id * 1.3) * 150,
                Math.cos(particle.id * 0.7) * 110,
                0,
              ],
              scale: [1, 1.5, 0.7, 1.2, 1],
              opacity: [0.4, 1, 0.6, 0.8, 0.4],
            }}
            transition={{
              duration: particle.duration,
              delay: particle.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Animated Ripple Effects */}
      <div className="absolute inset-0">
        {Array.from({ length: 4 }, (_, i) => (
          <motion.div
            key={`ripple-${i}`}
            className="absolute rounded-full border"
            style={{
              left: `${20 + i * 20}%`,
              top: `${30 + i * 15}%`,
              width: `${200 + i * 100}px`,
              height: `${200 + i * 100}px`,
              borderColor: `rgba(168, 85, 247, ${0.2 - i * 0.05})`,
              borderWidth: '2px',
              willChange: 'transform',
            }}
            animate={{
              scale: [1, 2.5 + i * 0.5, 1],
              opacity: [0.3, 0, 0.3],
            }}
            transition={{
              duration: 8 + i * 2,
              delay: i * 2,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
        ))}
      </div>

      {/* Subtle Noise Texture Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      ></div>

      {/* Radial Gradient Vignette */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, rgba(30, 0, 60, 0.15) 100%)'
        }}
      ></div>
    </div>
  );
});

AuthBackground.displayName = 'AuthBackground';

export default AuthBackground;

