import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CartView, SessionUser } from '@shared/types';
import { api } from './api';

export interface SiteConfig {
  payments: {
    provider: string;
    configured: boolean;
    webhookConfigured: boolean;
    mode: 'test' | 'live' | 'unconfigured';
    devPaymentsEnabled: boolean;
  };
  shipping: { freeThresholdPaise: number; flatRatePaise: number };
  supportEmail: string;
  supportEmailIsPlaceholder: boolean;
  devMode: boolean;
  devAuthHelpers: boolean;
  legalReviewRequired: boolean;
  commissionBasisNote: string;
}

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  config: SiteConfig | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => api<{ user: SessionUser | null }>('/auth/me'),
    retry: false,
    staleTime: 30_000,
  });
  const config = useQuery({
    queryKey: ['config'],
    queryFn: () => api<SiteConfig>('/config'),
    staleTime: Infinity,
  });

  const value = useMemo<AuthState>(
    () => ({
      user: session.data?.user ?? null,
      loading: session.isLoading,
      config: config.data ?? null,
      refresh: async () => {
        await queryClient.invalidateQueries({ queryKey: ['session'] });
      },
      signOut: async () => {
        await api('/auth/logout', { method: 'POST' });
        queryClient.setQueryData(['session'], { user: null });
        await queryClient.invalidateQueries({ queryKey: ['cart'] });
        await queryClient.invalidateQueries();
      },
    }),
    [session.data, session.isLoading, config.data, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

export function useCartQuery() {
  return useQuery({
    queryKey: ['cart'],
    queryFn: () => api<{ cart: CartView }>('/cart'),
    staleTime: 15_000,
  });
}

export function useCartCount(): number {
  const cart = useCartQuery();
  return cart.data?.cart.itemCount ?? 0;
}

export function useSiteContent() {
  return useQuery({
    queryKey: ['site-content'],
    queryFn: () => api<{ content: import('@shared/content').SiteContent }>('/site'),
    staleTime: 60_000,
  });
}
