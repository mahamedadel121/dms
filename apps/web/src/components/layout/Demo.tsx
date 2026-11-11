'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Users } from 'lucide-react';
import { api, tokens } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { can as canPure } from '@/lib/permissions';
import { findNavItem } from '@/lib/nav';
import { DEMO_USERS, demoPassword, demoRoleLabel, isDemoMode, stashDemoToast, takeDemoToast, type DemoUser } from '@/lib/demo';
import { cn } from '@/lib/cn';
import { Button, Icon, Menu, useToast, type MenuItem } from '@/components/ui';

/** Logs out the current session, logs in as `u` with the demo password and reloads the page. */
export function useDemoSwitch(): { switchTo: (u: DemoUser) => Promise<void>; busy: boolean } {
  const { login } = useAuth();
  const { t, locale } = useT();
  const toast = useToast();
  const path = usePathname();
  const [busy, setBusy] = useState(false);

  async function switchTo(u: DemoUser) {
    setBusy(true);
    try {
      try {
        await api.post('/auth/logout');
      } catch {
        /* already invalid */
      }
      tokens.clear();
      const me = await login(u.username, demoPassword());
      const hit = findNavItem(path);
      const target = !hit || canPure(me, hit.item.permission) ? path : '/inbox';
      stashDemoToast(t('shell.demo.nowAs', { role: demoRoleLabel(u, locale), name: me.fullName }));
      window.location.assign(target);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('shell.demo.switchFailed'));
      setBusy(false);
    }
  }
  return { switchTo, busy };
}

/** Shows the toast stored before a user-switch reload. Renders nothing. */
export function DemoToastRelay() {
  const toast = useToast();
  useEffect(() => {
    if (!isDemoMode()) return;
    const msg = takeDemoToast();
    if (msg) toast.success(msg);
  }, [toast]);
  return null;
}

/** TopBar menu listing the demo users. Demo mode only. */
export function DemoSwitcher() {
  const { me } = useAuth();
  const { t, locale } = useT();
  const { switchTo, busy } = useDemoSwitch();
  if (!isDemoMode()) return null;
  const items: MenuItem[] = DEMO_USERS.map((u) => ({
    key: u.username,
    testId: 'demo-switch-' + u.username,
    disabled: busy || me?.username === u.username,
    label: (
      <span className="flex w-full items-center gap-2">
        <span className="font-medium">{demoRoleLabel(u, locale)}</span>
        <span className="ms-auto text-xs text-ink-3" dir="ltr">{u.username}</span>
      </span>
    ),
    onSelect: () => void switchTo(u),
  }));
  return (
    <Menu
      align="end"
      testId="demo-switch-menu"
      items={items}
      trigger={
        <Button data-testid="demo-switch" variant="secondary" size="sm" loading={busy} icon={<Icon as={Users} size={16} />} title={t('shell.demo.switch')}>
          <span className="hidden sm:inline">{t('shell.demo.switch')}</span>
        </Button>
      }
    />
  );
}

/** Quick-login grid for the login page. Demo mode only. */
export function DemoQuickLogin({ onDone }: { onDone: () => void }) {
  const { login } = useAuth();
  const { t, locale } = useT();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (!isDemoMode()) return null;

  async function go(u: DemoUser) {
    setBusy(u.username);
    try {
      await login(u.username, demoPassword());
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('shell.demo.switchFailed'));
      setBusy(null);
    }
  }
  return (
    <section data-testid="demo-login" className="mt-8 border-t border-hairline pt-5">
      <p className="mb-3 text-xs font-medium text-ink-3">{t('shell.demo.quickLogin')}</p>
      <div className="grid grid-cols-2 gap-2">
        {DEMO_USERS.map((u) => (
          <button
            key={u.username}
            type="button"
            data-testid={'demo-login-' + u.username}
            disabled={busy !== null}
            onClick={() => void go(u)}
            className={cn(
              'flex min-h-11 flex-col items-start rounded border border-hairline bg-surface px-3 py-1.5 text-start transition-colors duration-1 hover:bg-surface-3 disabled:opacity-60',
              busy === u.username && 'border-primary',
            )}
          >
            <span className="text-sm font-medium text-ink">{demoRoleLabel(u, locale)}</span>
            <span className="text-xs text-ink-3" dir="ltr">{u.username}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
