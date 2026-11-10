'use client';

import { usePathname } from 'next/navigation';
import { ChevronRight, Menu, Moon, Search, Sun } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { usePrefs } from '@/lib/prefs';
import { findNavItem } from '@/lib/nav';
import { Button, Icon, IconButton } from '@/components/ui';
import { NotificationsBell } from './NotificationsBell';

const OUTSIDE_NAV: Record<string, string> = {
  '/profile': 'shell.page.profile',
  '/notifications': 'shell.page.notifications',
};

export function TopBar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const { t, locale, setLocale } = useT();
  const { resolvedTheme, setTheme } = usePrefs();
  const path = usePathname();
  const hit = findNavItem(path);
  const outside = Object.entries(OUTSIDE_NAV).find(([p]) => path === p || path.startsWith(p + '/'));
  const pageLabel = hit ? t(hit.item.labelKey) : outside ? t(outside[1]) : '';

  return (
    <header
      data-testid="topbar"
      data-no-print
      className="sticky top-band z-topbar flex h-topbar items-center gap-3 border-b border-hairline bg-canvas/90 px-4 backdrop-blur lg:px-8"
    >
      <IconButton className="lg:hidden" icon={<Icon as={Menu} />} label={t('common.nav.openMenu')} onClick={onMenu} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {hit && (
          <>
            <span className="hidden text-sm text-ink-3 md:inline">{t(hit.group.labelKey)}</span>
            <Icon as={ChevronRight} size={14} mirror className="hidden text-ink-3 md:inline" />
          </>
        )}
        <span className="truncate text-base font-medium text-ink md:text-sm">{pageLabel}</span>
      </div>
      <Button data-testid="topbar-search" variant="secondary" size="sm" className="hidden gap-2 text-ink-3 md:inline-flex" icon={<Icon as={Search} size={16} />} onClick={onSearch}>
        <span>{t('shell.search.placeholder')}</span>
        <kbd className="num rounded border border-hairline px-1 text-xs" dir="ltr">Ctrl K</kbd>
      </Button>
      <IconButton className="md:hidden" data-testid="topbar-search-mobile" icon={<Icon as={Search} />} label={t('shell.search.placeholder')} onClick={onSearch} />
      <Button data-testid="topbar-locale" variant="ghost" size="sm" className="hidden md:inline-flex" title={t('common.language')} onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
        {locale === 'ar' ? 'EN' : 'ع'}
      </Button>
      <IconButton
        data-testid="topbar-theme"
        className="hidden md:inline-flex"
        icon={<Icon as={resolvedTheme === 'dark' ? Sun : Moon} />}
        label={resolvedTheme === 'dark' ? t('shell.pref.light') : t('shell.pref.dark')}
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      />
      <NotificationsBell />
    </header>
  );
}
