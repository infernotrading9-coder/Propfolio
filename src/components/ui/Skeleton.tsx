import React from 'react';
import { motion } from 'framer-motion';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rectangular' | 'circular';
  width?: string;
  height?: string;
  animate?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rectangular',
  width,
  height,
  animate = true
}) => {
  const baseClasses = 'bg-white/10 rounded';
  const variantClasses = {
    text: 'h-4 w-full rounded',
    rectangular: 'rounded-lg',
    circular: 'rounded-full'
  };

  const style = {
    width: width || (variant === 'text' ? '100%' : undefined),
    height: height || (variant === 'text' ? '1rem' : undefined)
  };

  const pulseAnimation = {
    initial: { opacity: 0.6 },
    animate: { opacity: [0.6, 1, 0.6] },
    transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
  };

  return (
    <motion.div
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={style}
      {...(animate ? pulseAnimation : {})}
    />
  );
};

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`rounded-xl bg-[#050810] border border-white/10 p-4 ${className}`}>
    <div className="flex items-center justify-between mb-3">
      <div className="space-y-2 flex-1">
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="40%" height="12px" />
      </div>
      <Skeleton variant="circular" width="40px" height="40px" />
    </div>
    <div className="space-y-2">
      <Skeleton variant="text" width="80%" />
      <Skeleton variant="text" width="90%" />
    </div>
  </div>
);

export const SkeletonStats: React.FC = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {[...Array(6)].map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);

export const SkeletonChart: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`rounded-xl bg-[#050810] border border-white/10 p-4 ${className}`}>
    <div className="flex justify-between items-center mb-4">
      <Skeleton variant="text" width="150px" height="24px" />
      <Skeleton variant="text" width="80px" height="16px" />
    </div>
    <Skeleton variant="rectangular" width="100%" height="256px" />
  </div>
);