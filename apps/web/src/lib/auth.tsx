'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, tokens, UNAUTHORIZED_EVENT } from './api';
import { can as canPure } from './permissions';
import type { Me, TokenPair } from './types';

interface LoginResponse extends TokenPair {
  user: Me;
}

export interface AuthValue {
  me: Me | null;
  /** true until the first /auth/me attempt finished */
  loading: boolean;
  login: (username: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  reloadMe: () => Promise<void>;
  /** permission check; array = any-of; Super User passes everything */
  can: (code: string | readonly string[] | undefined) => boolean;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const reloadMe = useCallback(async () => {
    if (!tokens.get()) {
      setMe(null);
      return;
    }
    try {
      setMe(await api.get<Me>('/auth/me'));
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    reloadMe().finally(() => setLoading(false));
    const onUnauthorized = () => setMe(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [reloadMe]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.anonymousPost<LoginResponse>('/auth/login', { username, password });
    tokens.set(res);
    setMe(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* already invalid */
    }
    tokens.clear();
    setMe(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ me, loading, login, logout, reloadMe, can: (code) => canPure(me, code) }),
    [me, loading, login, logout, reloadMe],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
