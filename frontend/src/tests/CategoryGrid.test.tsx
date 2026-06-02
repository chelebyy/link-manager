import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CategoryGrid } from '../components/CategoryGrid/CategoryGrid';
import type { ResourceTypeDefinition } from '../types';

function makeType(overrides: Partial<ResourceTypeDefinition> = {}): ResourceTypeDefinition {
  return {
    id: 'github',
    name: 'GitHub',
    icon: 'github',
    color: '#171515',
    description: 'Repositories and code',
    is_builtin: true,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const TYPES: ResourceTypeDefinition[] = [
  makeType({ id: 'github', name: 'GitHub' }),
  makeType({ id: 'docs', name: 'Docs', icon: 'book', color: '#58a6ff' }),
];

describe('CategoryGrid UX-12 — keyboard accessible card', () => {
  it('card has role="button" and tabIndex={0}', () => {
    const onSelectType = vi.fn();
    render(<CategoryGrid resourceTypes={TYPES} onSelectType={onSelectType} />);

    // The filter row uses <button> with aria-label "Filter by <name>".
    // The card itself has no aria-label, so its accessible name is its text content
    // (h3 + description), e.g. "GitHub Repositories and code".
    const card = screen.getByRole('button', { name: 'GitHub Repositories and code' });
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute('tabindex', '0');
  });

  it('Enter keypress triggers the action', () => {
    const onSelectType = vi.fn();
    render(<CategoryGrid resourceTypes={TYPES} onSelectType={onSelectType} />);

    const card = screen.getByRole('button', { name: 'GitHub Repositories and code' });
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onSelectType).toHaveBeenCalledWith('github');
  });

  it('Space keypress triggers the action', () => {
    const onSelectType = vi.fn();
    render(<CategoryGrid resourceTypes={TYPES} onSelectType={onSelectType} />);

    const card = screen.getByRole('button', { name: 'Docs Repositories and code' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(onSelectType).toHaveBeenCalledWith('docs');
  });
});
