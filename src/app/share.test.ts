import { describe, expect, it, vi } from 'vitest';
import { shareLink, type ShareNavigator } from './share';

const data = { title: 'Standing Wave', text: 'The hook.', url: 'https://example.test/standing-wave/' };
const clipboard = () => ({ writeText: vi.fn(async () => undefined) });

describe('share', () => {
  it('uses Web Share when the browser has it', async () => {
    const nav = { share: vi.fn(async () => undefined), clipboard: clipboard() };
    expect(await shareLink(data, nav)).toBe('shared');
    expect(nav.share).toHaveBeenCalledWith(data);
    expect(nav.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('does nothing more when the person closes the share sheet', async () => {
    const nav = { share: vi.fn(async () => Promise.reject(Object.assign(new Error('closed'), { name: 'AbortError' }))), clipboard: clipboard() };
    expect(await shareLink(data, nav)).toBe('cancelled');
    expect(nav.clipboard.writeText).not.toHaveBeenCalled();
  });

  it.each<[string, ShareNavigator]>([
    ['without Web Share', { clipboard: clipboard() }],
    ['when Web Share fails', { share: async () => Promise.reject(new Error('NotAllowedError')), clipboard: clipboard() }],
    ['when the data cannot be shared', { share: async () => undefined, canShare: () => false, clipboard: clipboard() }],
  ])('copies the link %s', async (_, nav) => {
    expect(await shareLink(data, nav)).toBe('copied');
    expect(nav.clipboard!.writeText).toHaveBeenCalledWith(data.url);
  });

  it('reports a failure when the link cannot be copied either', async () => {
    expect(await shareLink(data, { clipboard: { writeText: async () => Promise.reject(new Error('denied')) } })).toBe('failed');
    expect(await shareLink(data, {})).toBe('failed');
  });
});
