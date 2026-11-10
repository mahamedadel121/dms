'use client';

import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, Languages, LogOut, Monitor, Moon, Sun, UserRound, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { usePrefs } from '@/lib/prefs';
import { cn } from '@/lib/cn';
import { Avatar, Icon, Menu, type MenuItem } from '@/components/ui';

type ActionItem = Exclude<MenuItem, { separator: true }>;

function useUserMenuItems(): MenuItem[] {
  const router = useRouter();
  const { logout } = useAuth();
  const { t, locale, setLocale } = useT();
  const { theme, setTheme } = usePrefs();
  const themeItem = (key: 'light' | 'dark' | 'system', icon: LucideIcon): ActionItem => ({
    key: 'theme-' + key,
    label: (
      <span className="flex w-full items-center gap-2">
        {t('shell.pref.' + key)}
        {theme === key && <Icon as={Check} size={16} className="ms-auto" />}
      </span>
    ),
    icon: <Icon as={icon} size={16} />,
    onSelect: () => setTheme(key),
  });
  return [
    { key: 'profile', label: t('shell.user.profile'), icon: <Icon as={UserRound} size={16} />, onSelect: () => router.push('/profile') },
    {
      key: 'locale',
      label: locale === 'ar' ? 'English' : 'العربية',
      icon: <Icon as={Languages} size={16} />,
      onSelect: () => setLocale(locale === 'ar' ? 'en' : 'ar'),
    },
    { key: 'sep1', separator: true },
    themeItem('light', Sun),
    themeItem('dark', Moon),
    themeItem('system', Monitor),
    { key: 'sep2', separator: true },
    {
      key: 'logout',
      label: t('shell.user.logout'),
      icon: <Icon as={LogOut} size={16} mirror />,
      danger: true,
      testId: 'user-menu-logout',
      onSelect: () => void logout().then(() => router.replace('/login')),
    },
  ];
}

/** Sidebar footer: avatar, name and first role; opens the account menu. */
export function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
  const { me } = useAuth();
  const { t, name } = useT();
  const items = useUserMenuItems();
  if (!me) return null;
  const role = me.roles[0] ? name(me.roles[0]) : '';
  return (
    <Menu
      align="start"
      testId="user-menu"
      items={items}
      trigger={
        <button
          type="button"
          aria-label={t('shell.user.menu')}
          className={cn('flex w-full items-center gap-3 rounded p-1.5 text-start transition-colors duration-1 hover:bg-surface-3', collapsed && 'justify-center')}
        >
          <Avatar name={me.fullName} size={32} />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{me.fullName}</span>
                {role && <span className="block truncate text-xs text-ink-3">{role}</span>}
              </span>
              <Icon as={ChevronsUpDown} size={16} className="text-ink-3" />
            </>
          )}
        </button>
      }
    />
  );
}

/** Same actions as plain buttons, for the footer of the mobile navigation drawer. */
export function UserMenuInline({ onDone }: { onDone?: () => void }) {
  const { me } = useAuth();
  const items = useUserMenuItems();
  if (!me) return null;
  return (
    <div data-testid="user-menu-inline" className="space-y-1">
      <div className="flex items-center gap-3 px-1 pb-2">
        <Avatar name={me.fullName} size={32} />
        <span className="truncate text-sm font-medium text-ink">{me.fullName}</span>
      </div>
      {items.map((i) =>
        'separator' in i ? (
          <div key={i.key} className="my-1 h-px bg-hairline" />
        ) : (
          <button
            key={i.key}
            type="button"
            data-testid={i.testId ? i.testId + '-inline' : undefined}
            onClick={() => {
              i.onSelect();
              onDone?.();
            }}
            className={cn('flex h-10 w-full items-center gap-2 rounded px-2.5 text-sm hover:bg-surface-3', i.danger ? 'text-danger' : 'text-ink')}
          >
            {i.icon}
            {i.label}
          </button>
        ),
      )}
    </div>
  );
}
