import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { LoadingSpinner } from './LoadingSpinner';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  glow?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  children,
  leftIcon,
  rightIcon,
  glow = false,
  className = '',
  ...props
}) => {
  const variants = {
    primary: 'bg-purple-600 hover:bg-purple-500 text-white border border-purple-500/50 hover:border-purple-400/50 animate-border-glow drop-shadow-neon',
    secondary: 'bg-white/10 hover:bg-white/15 text-white border border-white/20 hover:border-white/30 hover:drop-shadow-neon',
    success: 'bg-lime-600 hover:bg-lime-500 text-white border border-lime-500/50 hover:border-lime-400/50 animate-lime-glow drop-shadow-neon-lime',
    danger: 'bg-red-600 hover:bg-red-500 text-white border border-red-500/50 hover:border-red-400/50 animate-pink-glow drop-shadow-neon-pink',
    ghost: 'bg-transparent hover:bg-white/10 text-white/70 hover:text-white border border-transparent hover:border-white/20 hover:drop-shadow-neon'
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  const glowEffects = {
    primary: glow ? 'shadow-[0_0_20px_rgba(168,85,247,0.4)]' : '',
    secondary: glow ? 'shadow-[0_0_20px_rgba(255,255,255,0.2)]' : '',
    success: glow ? 'shadow-[0_0_20px_rgba(163,230,53,0.4)]' : '',
    danger: glow ? 'shadow-[0_0_20px_rgba(239,68,68,0.4)]' : '',
    ghost: ''
  };

  const isDisabled = disabled || loading;

  const buttonAnimation = {
    whileTap: !isDisabled ? { scale: 0.98 } : {},
    whileHover: !isDisabled ? { y: -1 } : {},
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 25
    }
  };

  return (
    <motion.button
      {...buttonAnimation}
      className={`
        ${variants[variant]}
        ${sizes[size]}
        ${glowEffects[variant]}
        relative
        rounded-lg
        font-medium
        transition-all
        duration-200
        focus:outline-none
        focus:ring-2
        focus:ring-purple-500/50
        focus:ring-offset-2
        focus:ring-offset-[#020408]
        disabled:opacity-50
        disabled:cursor-not-allowed
        disabled:transform-none
        flex
        items-center
        justify-center
        gap-2
        ${className}
      `}
      disabled={isDisabled}
      {...props}
    >
      {/* Loading overlay */}
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex items-center justify-center bg-inherit rounded-lg"
        >
          <LoadingSpinner size="sm" color={variant === 'primary' ? 'purple' : 'cyan'} />
        </motion.div>
      )}

      {/* Content */}
      <span className={`flex items-center gap-2 ${loading ? 'opacity-0' : 'opacity-100'}`}>
        {leftIcon && (
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            {leftIcon}
          </motion.span>
        )}
        {children}
        {rightIcon && (
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            {rightIcon}
          </motion.span>
        )}
      </span>
    </motion.button>
  );
};