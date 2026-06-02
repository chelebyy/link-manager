import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ToastBanner, type ToastItem } from '../components/ui/toast-banner';

const sampleToasts: ToastItem[] = [
  { id: 1, kind: 'success', title: 'Kaydedildi', description: 'Link başarıyla eklendi' },
  { id: 2, kind: 'error', title: 'Hata', description: 'İşlem başarısız oldu' },
];

describe('ToastBanner accessibility (UX-4)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the container with role=region, aria-live=polite, and a Turkish label', () => {
    render(<ToastBanner toasts={[]} onDismiss={vi.fn()} />);
    const region = screen.getByRole('region', { name: /bildirimler/i });
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('renders success toasts with role=status and no aria-live override', () => {
    const toasts: ToastItem[] = [
      { id: 10, kind: 'success', title: 'Başarılı' },
    ];
    render(<ToastBanner toasts={toasts} onDismiss={vi.fn()} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Başarılı');
    expect(status).not.toHaveAttribute('aria-live');
  });

  it('renders error toasts with role=alert and aria-live=assertive', () => {
    const toasts: ToastItem[] = [
      { id: 20, kind: 'error', title: 'Bir hata oluştu' },
    ];
    render(<ToastBanner toasts={toasts} onDismiss={vi.fn()} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Bir hata oluştu');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });

  it('mixes role=status and role=alert in the same region', () => {
    render(<ToastBanner toasts={sampleToasts} onDismiss={vi.fn()} />);
    // 1 status (success) + 1 alert (error)
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    // region container still wraps both
    const region = screen.getByRole('region', { name: /bildirimler/i });
    expect(region).toContainElement(screen.getByRole('status'));
    expect(region).toContainElement(screen.getByRole('alert'));
  });
});
