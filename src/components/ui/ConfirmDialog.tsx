import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info' | 'success';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
  loading = false
}) => {
  const variants = {
    danger: {
      icon: AlertTriangle,
      iconColor: 'text-red-400',
      confirmButton: 'bg-red-600 hover:bg-red-500 focus:ring-red-500',
      glow: 'shadow-[0_0_25px_rgba(239,68,68,0.3)]'
    },
    warning: {
      icon: AlertTriangle,
      iconColor: 'text-amber-400',
      confirmButton: 'bg-amber-600 hover:bg-amber-500 focus:ring-amber-500',
      glow: 'shadow-[0_0_25px_rgba(245,158,11,0.3)]'
    },
    info: {
      icon: AlertTriangle,
      iconColor: 'text-cyan-400',
      confirmButton: 'bg-cyan-600 hover:bg-cyan-500 focus:ring-cyan-500',
      glow: 'shadow-[0_0_25px_rgba(34,211,238,0.3)]'
    },
    success: {
      icon: CheckCircle,
      iconColor: 'text-emerald-400',
      confirmButton: 'bg-emerald-600 hover:bg-emerald-500 focus:ring-emerald-500',
      glow: 'shadow-[0_0_25px_rgba(16,185,129,0.3)]'
    }
  };

  const config = variants[variant];
  const IconComponent = config.icon;

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, loading, onCancel]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={!loading ? onCancel : undefined}
          />
          
          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`relative w-full max-w-md bg-[#050810] border border-white/20 rounded-xl p-6 ${config.glow}`}
          >
            {/* Close button */}
            {!loading && (
              <button
                onClick={onCancel}
                className="absolute top-4 right-4 p-1 rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5 text-white/60 hover:text-white" />
              </button>
            )}
            
            {/* Content */}
            <div className="flex items-start gap-4">
              <div className={`flex-shrink-0 p-2 rounded-full bg-white/5 ${config.iconColor}`}>
                <IconComponent className="w-6 h-6" />
              </div>
              
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
                <p className="text-white/70 text-sm leading-relaxed">{message}</p>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={onCancel}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelText}
              </button>
              
              <button
                onClick={onConfirm}
                disabled={loading}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#050810] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${config.confirmButton}`}
              >
                {loading && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};