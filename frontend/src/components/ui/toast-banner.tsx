import { X, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from './button';

export type ToastKind = 'success' | 'error';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

interface ToastBannerProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

export function ToastBanner({ toasts, onDismiss }: ToastBannerProps) {
  return (
    <div className="fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = toast.kind === 'success' ? CheckCircle2 : AlertCircle;
        return (
          <div
            key={toast.id}
            className={`rounded-lg border p-4 shadow-lg ${toast.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100' : 'border-red-200 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100'}`}
          >
            <div className="flex items-start gap-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{toast.title}</div>
                {toast.description ? <div className="mt-1 text-xs opacity-90">{toast.description}</div> : null}
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDismiss(toast.id)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
