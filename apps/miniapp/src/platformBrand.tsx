import { SiInstagram, SiTiktok, SiYoutube, SiTelegram, SiThreads, SiFacebook } from 'react-icons/si';
import { Globe } from 'lucide-react';

// react-icons IconType and LucideIcon share size/color props — use a minimal union.
type IconComp = React.ComponentType<{ size?: number | string; color?: string }>;

interface PlatformBrand {
  Icon: IconComp;
  /** Returns icon color: brand hex or adapted for dark theme. */
  color: (isDark: boolean) => string;
  label: string;
}

const BRAND_MAP: Record<string, PlatformBrand> = {
  Instagram: { Icon: SiInstagram as IconComp, color: () => '#E4405F', label: 'Instagram' },
  // TikTok brand colour is black — use white on dark to maintain contrast.
  TikTok:    { Icon: SiTiktok as IconComp,    color: (d) => (d ? '#FFFFFF' : '#000000'), label: 'TikTok' },
  YouTube:   { Icon: SiYoutube as IconComp,   color: () => '#FF0000', label: 'YouTube' },
  Telegram:  { Icon: SiTelegram as IconComp,  color: () => '#26A5E4', label: 'Telegram' },
  // Threads brand colour is black — same dark-theme treatment as TikTok.
  Threads:   { Icon: SiThreads as IconComp,   color: (d) => (d ? '#FFFFFF' : '#000000'), label: 'Threads' },
  Facebook:  { Icon: SiFacebook as IconComp,  color: () => '#0866FF', label: 'Facebook' },
};

const FALLBACK: PlatformBrand = {
  Icon: Globe as unknown as IconComp,
  color: () => 'var(--nm-ink-2)',
  label: 'Другое',
};

export function getPlatformBrand(platform: string): PlatformBrand {
  return BRAND_MAP[platform] ?? { ...FALLBACK, label: platform || 'Другое' };
}

/** Reads the current Telegram color scheme at render time. */
export function getIsDark(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).Telegram?.WebApp?.colorScheme === 'dark';
}
