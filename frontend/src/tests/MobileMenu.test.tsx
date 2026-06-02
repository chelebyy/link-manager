import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MobileMenu } from '../components/MobileMenu/MobileMenu';

const sampleItems = [
  { id: 'edit', label: 'Düzenle', icon: <span data-testid="icon-edit">E</span>, onClick: vi.fn() },
  { id: 'delete', label: 'Sil', icon: <span data-testid="icon-delete">D</span>, onClick: vi.fn(), variant: 'destructive' as const },
];

const renderMenu = () => render(<MobileMenu items={sampleItems} trigger={<span>≡</span>} />);

describe('MobileMenu accessibility (UX-3)', () => {
  afterEach(() => {
    sampleItems.forEach((item) => item.onClick.mockClear());
    // Make sure no menu is leaking between tests
    document.body.innerHTML = '';
  });

  it('opens the menu with role=dialog, aria-modal=true, aria-labelledby, and aria-expanded on the trigger', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: /menüyü aç/i });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');

    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    // The label id resolves to an element with non-empty text.
    expect(document.getElementById(labelledBy as string)?.textContent).toBeTruthy();
  });

  it('focuses the first focusable element inside the menu when opened', async () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: /menüyü aç/i });
    fireEvent.click(trigger);

    await waitFor(() => {
      const firstButton = screen.getByRole('button', { name: /düzenle/i });
      expect(firstButton).toHaveFocus();
    });
  });

  it('closes the menu when Escape is pressed', async () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /menüyü aç/i }));

    // Wait for the menu to be rendered
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('returns focus to the trigger element after the menu is closed', async () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: /menüyü aç/i });
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it('traps focus inside the menu: Tab on the last element wraps to the first', async () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: /menüyü aç/i });
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Focusable order in the menu: Düzenle, Sil, İptal
    const editButton = await screen.findByRole('button', { name: /düzenle/i });
    const deleteButton = screen.getByRole('button', { name: /sil/i });
    const cancelButton = screen.getByRole('button', { name: 'İptal' });

    // Verify the trap logic by directly calling the document keydown handler
    // while focus is on the last element. The handler should prevent default
    // and move focus to the first element.
    cancelButton.focus();
    expect(cancelButton).toHaveFocus();

    act(() => {
      fireEvent.keyDown(document, { key: 'Tab' });
    });

    await waitFor(() => {
      expect(editButton).toHaveFocus();
    });

    // Conversely, Shift+Tab from the first element wraps to the last.
    editButton.focus();
    expect(editButton).toHaveFocus();

    act(() => {
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    });

    await waitFor(() => {
      expect(cancelButton).toHaveFocus();
    });

    // Sanity: focus never landed on the trigger while the menu was open.
    expect(trigger).not.toHaveFocus();
    expect(deleteButton).not.toHaveFocus();
  });
});
