import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
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
    primary: 'bg-purple-600 text-white border border-purple-500/50 drop-shadow-neon',
    secondary: 'bg-white/10 text-white border border-white/20',
    success: 'bg-lime-600 text-white border border-lime-500/50 drop-shadow-neon-lime',
    danger: 'bg-red-600 text-white border border-red-500/50 drop-shadow-neon-pink',
    ghost: 'bg-transparent text-white/70 border border-transparent'
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

  return (
    <button
      className={`
        ${variants[variant]}
        ${sizes[size]}
        ${glowEffects[variant]}
        relative
        rounded-lg
        font-medium
        focus:outline-none
        focus:ring-2
        focus:ring-purple-500/50
        focus:ring-offset-2
        focus:ring-offset-[#020408]
        disabled:opacity-50
        disabled:cursor-not-allowed
        flex
        items-center
        justify-center
        gap-2
        ${className}
      `}
      disabled={isDisabled}
      {...props}
    >
      {loading && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-inherit rounded-lg"
        >
          <LoadingSpinner size="sm" color={variant === 'primary' ? 'purple' : 'cyan'} />
        </div>
      )}

      <span className={`flex items-center gap-2 ${loading ? 'opacity-0' : 'opacity-100'}`}>
        {leftIcon && <span>{leftIcon}</span>}
        {children}
        {rightIcon && <span>{rightIcon}</span>}
      </span>
    </button>
  );
};
