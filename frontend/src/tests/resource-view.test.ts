import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSelectedViewMarkdown, downloadMarkdown } from '../lib/resource-view';
import type { ResourceWithSync } from '../types';

describe('buildSelectedViewMarkdown', () => {
  it('includes markdown metadata and selected resource details', () => {
    const resources: ResourceWithSync[] = [
      {
        id: 79,
        category_id: null,
        type: 'github',
        title: 'AI-Infra-Guard',
        url: 'https://github.com/Tencent/AI-Infra-Guard',
        description: 'AI security platform',
        metadata: {},
        is_favorite: true,
        sort_order: 1,
        created_at: '2026-05-15T00:00:00.000Z',
        updated_at: '2026-05-15T00:00:00.000Z',
      },
    ];

    const markdown = buildSelectedViewMarkdown({
      typeLabel: 'GitHub Repos',
      selectedCategoryName: null,
      searchQuery: '',
      filterMode: 'all',
      resources,
    });

    expect(markdown).toContain('# Link Manager Export');
    expect(markdown).toContain('## GitHub Repos');
    expect(markdown).toContain('- Görünüm: Tüm kaynaklar');
    expect(markdown).toContain('- ★ AI-Infra-Guard');
    expect(markdown).toContain('  - URL: https://github.com/Tencent/AI-Infra-Guard');
  });
});

describe('downloadMarkdown', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads a markdown blob with the requested filename', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadMarkdown('selected.md', '# Hello');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob instanceof Blob ? blob.type : '').toBe('text/markdown;charset=utf-8');
    await expect(blob instanceof Blob ? blob.text() : Promise.resolve('')).resolves.toBe('# Hello');

    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement | undefined;
    expect(anchor?.download).toBe('selected.md');
    expect(anchor?.href).toBe('blob:test');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
});
