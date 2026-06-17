/**
 * Toast - Notification toast component
 */

import { memo, useState } from 'react';
import { X, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useUIStore } from '@/shared/stores/ui.store';

// ==================== Types ====================

interface ToastItemProps {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  onClose: () => void;
}

// ==================== Toast Item ====================

const ToastItem = memo(function ToastItem({
  type,
  title,
  message,
  onClose,
}: ToastItemProps) {
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onClose, 150);
  };

  const icons = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
  };

  const styles = {
    success: {
      bg: 'bg-emerald-600/20 border-emerald-500/30',
      icon: 'text-emerald-400',
    },
    error: {
      bg: 'bg-red-600/20 border-red-500/30',
      icon: 'text-red-400',
    },
    warning: {
      bg: 'bg-amber-600/20 border-amber-500/30',
      icon: 'text-amber-400',
    },
    info: {
      bg: 'bg-blue-600/20 border-blue-500/30',
      icon: 'text-blue-400',
    },
  };

  const Icon = icons[type];
  const style = styles[type];

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-xl border shadow-lg backdrop-blur-sm',
        'transition-all duration-150',
        style.bg,
        isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
      )}
      role="alert"
    >
      <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', style.icon)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{title}</p>
        {message && (
          <p className="text-xs text-zinc-400 mt-0.5">{message}</p>
        )}
      </div>
      <button
        onClick={handleClose}
        className="flex-shrink-0 p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Close notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
});

// ==================== Toast Container ====================

export const ToastContainer = memo(function ToastContainer() {
  const notifications = useUIStore((state) => state.notifications);
  const removeNotification = useUIStore((state) => state.removeNotification);

  if (notifications.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      aria-live="polite"
      aria-label="Notifications"
    >
      {notifications.map((notification) => (
        <div key={notification.id} className="pointer-events-auto">
          <ToastItem
            id={notification.id}
            type={notification.type}
            title={notification.title}
            message={notification.message}
            onClose={() => removeNotification(notification.id)}
          />
        </div>
      ))}
    </div>
  );
});

export default ToastContainer;
