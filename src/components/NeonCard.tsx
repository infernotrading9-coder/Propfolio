import React from 'react';

interface NeonCardProps extends React.HTMLAttributes<HTMLDivElement> {
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
    purple: '',
    cyan: '',
    pink: '',
    lime: '',
    amber: '',
  };

  const hoverGlowMap: Record<string, string> = {
    purple: '',
    cyan: '',
    pink: '',
    lime: '',
    amber: '',
  };

  return (
    <div
      className={`
        rounded-xl 
        bg-[#050810] 
        border 
        border-white/10 
        
        ${glowMap[glow] ?? glowMap.purple} 
        ${interactive ? hoverGlowMap[glow] ?? hoverGlowMap.purple : ''}
        ${interactive ? 'cursor-pointer' : ''}
        ${loading ? 'opacity-75 pointer-events-none' : ''}
        ${className}
      `}
      {...rest}
    >
      {loading && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-[#050810]/80 backdrop-blur-sm rounded-xl z-10"
        >
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div className={loading ? 'opacity-50' : ''}>
        {children}
      </div>
    </div>
  );
};
