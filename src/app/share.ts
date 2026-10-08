export type ShareData = Readonly<{ title: string; text: string; url: string }>;
export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';
export type ShareNavigator = Readonly<{
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  clipboard?: Readonly<{ writeText(text: string): Promise<void> }>;
}>;

export async function shareLink(data: ShareData, nav: ShareNavigator = navigator): Promise<ShareResult> {
  if (nav.share && (!nav.canShare || nav.canShare(data))) {
    try {
      await nav.share(data);
      return 'shared';
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    if (!nav.clipboard) return 'failed';
    await nav.clipboard.writeText(data.url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
