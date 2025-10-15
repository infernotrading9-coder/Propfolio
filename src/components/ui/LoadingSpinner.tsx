import React from 'react';
import { motion } from 'framer-motion';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'purple' | 'cyan' | 'pink' | 'lime' | 'amber';
  className?: string;
}

const sizeMap = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8'
};

const colorMap = {
  purple: 'border-purple-500',
  cyan: 'border-cyan-400',
  pink: 'border-pink-400',
  lime: 'border-lime-400',
  amber: 'border-amber-400'
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  color = 'purple', 
  className = '' 
}) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`${sizeMap[size]} ${className}`}
    >
      <div className={`${sizeMap[size]} border-2 ${colorMap[color]} border-t-transparent rounded-full animate-spin`} />
    </motion.div>
  );
};