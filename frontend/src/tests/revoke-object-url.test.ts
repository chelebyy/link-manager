import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadJson, downloadMarkdown } from '../lib/resource-view';

// Regression coverage for Firefox Bugzilla 1424255: calling
// URL.revokeObjectURL synchronously after `link.click()` can cancel the
// in-flight download in some browsers. Both download helpers must defer
// the revoke so the browser has time to start the download first.

describe('URL.revokeObjectURL deferral (Firefox 1424255)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('downloadMarkdown defers revokeObjectURL via setTimeout', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:md');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadMarkdown('regression.md', '# Content');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);

    // Revoke has not fired yet — the download is still in flight.
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:md');
  });

  it('downloadJson defers revokeObjectURL via setTimeout', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:json');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadJson('regression.json', { ok: true });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);

    // Revoke has not fired yet — the download is still in flight.
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:json');
  });
});
