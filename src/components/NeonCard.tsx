import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';

interface NeonCardProps extends HTMLMotionProps<'div'> {
  glow?: string; // tailwind shadow color
  interactive?: boolean;
  loading?: boolean;
}

export const NeonCard: React.FC<NeonCardProps> = ({ 
  children, 
  className = '', 
  glow = 'purple', 
  interactive = false,
  loading = false,
  ...rest 
}) => {
  const glowMap: Record<string, string> = {
    purple: 'animate-border-glow',
    cyan: 'animate-cyan-glow',
    pink: 'animate-pink-glow',
    lime: 'animate-lime-glow',
    amber: 'animate-amber-glow',
  };

  const hoverGlowMap: Record<string, string> = {
    purple: 'hover:shadow-[0_0_35px_rgba(168,85,247,0.6)]',
    cyan: 'hover:shadow-[0_0_35px_rgba(34,211,238,0.6)]',
    pink: 'hover:shadow-[0_0_35px_rgba(244,114,182,0.6)]',
    lime: 'hover:shadow-[0_0_35px_rgba(163,230,53,0.6)]',
    amber: 'hover:shadow-[0_0_35px_rgba(245,158,11,0.6)]',
  };

  const cardAnimation = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    whileHover: interactive ? {
      y: -4,
      scale: 1.02,
      transition: { duration: 0.2, ease: 'easeOut' }
    } : {
      y: -2,
      scale: 1.01,
      transition: { duration: 0.2, ease: 'easeOut' }
    },
    whileTap: interactive ? {
      scale: 0.98,
      transition: { duration: 0.1 }
    } : {},
    transition: {
      duration: 0.3,
      ease: 'easeOut'
    }
  };

  return (
    <motion.div
      {...cardAnimation}
      className={`
        rounded-xl 
        bg-[#050810] 
        border 
        border-white/10 
        hover:border-white/20
        ${glowMap[glow] ?? glowMap.purple} 
        ${interactive ? hoverGlowMap[glow] ?? hoverGlowMap.purple : ''}
        ${interactive ? 'cursor-pointer' : ''}
        ${loading ? 'opacity-75 pointer-events-none' : ''}
        transition-all
        duration-300
        ${className}
      `}
      {...rest}
    >
      {/* Loading overlay */}
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex items-center justify-center bg-[#050810]/80 backdrop-blur-sm rounded-xl z-10"
        >
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </motion.div>
      )}
      
      {/* Content with subtle animation */}
      <motion.div
        initial={{ opacity: 0.8 }}
        animate={{ opacity: 1 }}
        className={loading ? 'opacity-50' : ''}
      >
        {children}
      </motion.div>
    </motion.div>
  );
};
