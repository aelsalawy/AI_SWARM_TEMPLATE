import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';
import { cn } from '@/src/lib/utils';

type ToastType = 'success' | 'warning' | 'info' | 'error';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: {
    success: (msg: string) => void;
    warning: (msg: string) => void;
    info: (msg: string) => void;
    error: (msg: string) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.toast;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-4 h-4" />,
  warning: <AlertTriangle className="w-4 h-4" />,
  info: <Info className="w-4 h-4" />,
  error: <XCircle className="w-4 h-4" />,
};

const COLORS: Record<ToastType, string> = {
  success: 'bg-green-50 border-green-200 text-green-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  error: 'bg-red-50 border-red-200 text-red-800',
};

const ICON_COLORS: Record<ToastType, string> = {
  success: 'text-green-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
  error: 'text-red-500',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = `toast-${++counter.current}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value: ToastContextValue = {
    toast: {
      success: (msg) => addToast(msg, 'success'),
      warning: (msg) => addToast(msg, 'warning'),
      info: (msg) => addToast(msg, 'info'),
      error: (msg) => addToast(msg, 'error'),
    },
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast container — top-right stacking */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 380 }}>
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 60, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.95 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className={cn(
                'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm',
                COLORS[t.type],
              )}
            >
              <span className={cn('flex-shrink-0', ICON_COLORS[t.type])}>{ICONS[t.type]}</span>
              <p className="text-sm font-medium flex-1 leading-snug">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
