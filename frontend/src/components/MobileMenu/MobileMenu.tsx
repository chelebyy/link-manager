import { useState, type ReactNode } from 'react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

interface MobileMenuItem {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive';
}

interface MobileMenuProps {
  items: MobileMenuItem[];
  trigger: ReactNode;
}

export function MobileMenu({ items, trigger }: MobileMenuProps) {
  const [open, setOpen] = useState(false);

  const handleItemClick = (onClick: () => void) => {
    onClick();
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-sm border border-border bg-background text-foreground hover:bg-muted transition-colors sm:hidden"
        aria-label="Menüyü aç"
      >
        {trigger}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm sm:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            className={cn(
              'fixed bottom-0 left-0 right-0 z-50 rounded-t-xl border-t border-border bg-background p-4 shadow-xl sm:hidden',
              'animate-in slide-in-from-bottom duration-300'
            )}
            role="dialog"
            aria-modal="true"
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-muted" />
            <div className="space-y-2">
              {items.map((item) => (
                <Button
                  key={item.id}
                  variant={item.variant === 'destructive' ? 'destructive' : 'outline'}
                  className="w-full justify-start gap-3 h-12 text-sm font-mono"
                  onClick={() => handleItemClick(item.onClick)}
                >
                  {item.icon}
                  {item.label}
                </Button>
              ))}
            </div>
            <Button
              variant="ghost"
              className="mt-3 w-full h-12 text-sm font-mono"
              onClick={() => setOpen(false)}
            >
              İptal
            </Button>
          </div>
        </>
      )}
    </>
  );
}
