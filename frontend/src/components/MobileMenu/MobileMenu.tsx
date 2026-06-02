import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MobileMenu({ items, trigger }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    // Focus the first focusable element inside the menu.
    const menu = menuRef.current;
    if (menu) {
      const focusables = menu.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const first = focusables[0];
      // Defer to the next frame so the dialog exists in the DOM before we focus.
      requestAnimationFrame(() => {
        first?.focus();
      });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key !== 'Tab' || !menu) return;

      const focusables = Array.from(
        menu.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute('disabled'));
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Return focus to the trigger that opened the menu.
      triggerRef.current?.focus();
    };
  }, [open]);

  const handleItemClick = (onClick: () => void) => {
    onClick();
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-sm border border-border bg-background text-foreground hover:bg-muted transition-colors sm:hidden"
        aria-label="Menüyü aç"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {trigger}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm sm:hidden"
            onClick={close}
            aria-hidden="true"
          />
          <div
            ref={menuRef}
            className={cn(
              'fixed bottom-0 left-0 right-0 z-50 rounded-t-xl border-t border-border bg-background p-4 shadow-xl sm:hidden',
              'animate-in slide-in-from-bottom duration-300'
            )}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <h2 id={titleId} className="sr-only">
              Mobil menü
            </h2>
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
              onClick={close}
            >
              İptal
            </Button>
          </div>
        </>
      )}
    </>
  );
}
