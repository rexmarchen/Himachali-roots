import { useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApplicationStatus, CampaignSummary, Category, OrderView, Paged, ProductStatus } from '@shared/types';
import { APPLICATION_STATUS_LABELS, PRODUCT_WORKFLOW_LABELS, STORE_STATUS_LABELS, formatINR } from '@shared/types';
import type { SiteContent } from '@shared/content';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { usePageMeta } from '@/lib/usePageMeta';
import { dateInputToIso, daysAgoInput, formatDate, formatDateTime, humanise, orderStatusLabel, percentFromBp, sellerOrderStatusLabel, todayInput } from '@/lib/format';
import { AdminMetric, AdminPage, AdminQueueRow, AdminSection, ConfirmDialog } from '@/components/admin';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LinkButton,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Stat,
  StatusBadge,
  Textarea,
} from '@/components/ui';

/* ============================ ADMIN ICONOGRAPHY ============================ */

function MountainLogoSvg({ className = 'h-8 w-auto' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 32" className={className} fill="none" aria-hidden>
      <path d="M4 28 L18 8 L27 21 L31 15 L44 28 Z" fill="#F4E8CE" />
      <path d="M18 8 L22 14 L14 28 L4 28 Z" fill="#CB8E8B" opacity="0.55" />
      <path d="M31 15 L36 22 L26 28 L44 28 Z" fill="#CB8E8B" opacity="0.4" />
      <path d="M18 8 L15 13 L21 13 Z" fill="#FFFFFF" />
      <path d="M31 15 L29 18 L33 18 Z" fill="#FFFFFF" />
    </svg>
  );
}

function NavIcon({ type, className = 'h-4 w-4' }: { type: string; className?: string }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className, 'aria-hidden': true };
  switch (type) {
    case 'dashboard':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      );
    case 'orders':
      return (
        <svg {...common}>
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <path d="M3 6h18" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      );
    case 'products':
      return (
        <svg {...common}>
          <path d="m7.5 4.27 9 5.15" />
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      );
    case 'categories':
      return (
        <svg {...common}>
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
        </svg>
      );
    case 'sellers':
      return (
        <svg {...common}>
          <path d="M3 9h18l-1.5 11.5a2 2 0 0 1-2 1.5H6.5a2 2 0 0 1-2-1.5Z" />
          <path d="M8 9V6a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case 'settlements':
      return (
        <svg {...common}>
          <path d="M3 6h18v12H3z" />
          <path d="M3 10h18" />
          <path d="M7 15h4" />
        </svg>
      );
    case 'customers':
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'reviews':
      return (
        <svg {...common}>
          <path d="M12 2.5 15 9l7 .9-5 4.7 1.3 6.9L12 18l-6.3 3.5L7 14.6 2 9.9 9 9z" />
        </svg>
      );
    case 'support':
      return (
        <svg {...common}>
          <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="M8 9h8" />
          <path d="M8 13h5" />
        </svg>
      );
    case 'payments':
      return (
        <svg {...common}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
          <path d="M6 15h4" />
        </svg>
      );
    case 'refunds':
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 3v6h6" />
          <path d="M12 8v8" />
          <path d="M9.5 10.5c0-1 1-1.5 2.5-1.5s2.5.5 2.5 1.5-1 1.5-2.5 1.5-2.5.5-2.5 1.5 1 1.5 2.5 1.5 2.5-.5 2.5-1.5" />
        </svg>
      );
    case 'returns':
      return (
        <svg {...common}>
          <path d="M3 7v6h6" />
          <path d="M3.5 13A9 9 0 1 0 6 5.3L3 7" />
          <path d="M12 8v8" />
          <path d="m9 13 3 3 3-3" />
        </svg>
      );
    case 'cancellations':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 8.5 7 7" />
          <path d="m15.5 8.5-7 7" />
        </svg>
      );
    case 'commissions':
      return (
        <svg {...common}>
          <path d="M4 20V10" />
          <path d="M10 20V4" />
          <path d="M16 20v-7" />
          <path d="M22 20H2" />
        </svg>
      );
    case 'campaigns':
      return (
        <svg {...common}>
          <path d="m3 11 18-7-7 18-2.5-7.5z" />
          <path d="M11.5 10.5 21 4" />
        </svg>
      );
    case 'coupons':
      return (
        <svg {...common}>
          <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z" />
          <path d="M9 9h6" />
          <path d="M9 15h6" />
        </svg>
      );
    case 'content':
      return (
        <svg {...common}>
          <path d="M4 4h16v16H4z" />
          <path d="M8 8h8" />
          <path d="M8 12h8" />
          <path d="M8 16h5" />
        </svg>
      );
    case 'audit':
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h6" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...common}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case 'storefront':
      return (
        <svg {...common}>
          <path d="M3 9h18l-1.5 11.5a2 2 0 0 1-2 1.5H6.5a2 2 0 0 1-2-1.5Z" />
          <path d="M3 9 4.5 4h15L21 9" />
          <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
        </svg>
      );
    case 'close':
      return (
        <svg {...common}>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}

type BadgeKey = 'sellers' | 'products' | 'refunds' | 'returns' | 'support' | 'unfulfilled';

const ADMIN_NAV: {
  label: string;
  items: { label: string; to: string; icon: string; badge?: BadgeKey; end?: boolean }[];
}[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', to: '/admin', icon: 'dashboard', end: true }],
  },
  {
    label: 'Trade',
    items: [
      { label: 'Orders', to: '/admin/orders', icon: 'orders', badge: 'unfulfilled' },
      { label: 'Products', to: '/admin/products', icon: 'products', badge: 'products' },
      { label: 'Categories', to: '/admin/categories', icon: 'categories' },
    ],
  },
  {
    label: 'Makers',
    items: [
      { label: 'Seller applications', to: '/admin/sellers', icon: 'sellers', badge: 'sellers' },
      { label: 'Settlements', to: '/admin/settlements', icon: 'settlements' },
    ],
  },
  {
    label: 'Customers',
    items: [
      { label: 'Customers', to: '/admin/customers', icon: 'customers' },
      { label: 'Reviews', to: '/admin/reviews', icon: 'reviews' },
      { label: 'Support', to: '/admin/support', icon: 'support', badge: 'support' },
    ],
  },
  {
    label: 'Money',
    items: [
      { label: 'Payments', to: '/admin/payments', icon: 'payments' },
      { label: 'Refunds', to: '/admin/refunds', icon: 'refunds', badge: 'refunds' },
      { label: 'Returns', to: '/admin/returns?status=requested', icon: 'returns', badge: 'returns' },
      { label: 'Cancellations', to: '/admin/cancellations', icon: 'cancellations' },
    ],
  },
  {
    label: 'Growth',
    items: [
      { label: 'Commissions', to: '/admin/commissions', icon: 'commissions' },
      { label: 'Coupons', to: '/admin/coupons', icon: 'coupons' },
      { label: 'Campaigns', to: '/admin/campaigns', icon: 'campaigns' },
      { label: 'Site content', to: '/admin/content', icon: 'content' },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Audit log', to: '/admin/audit', icon: 'audit' },
      { label: 'Settings', to: '/admin/settings', icon: 'settings' },
    ],
  },
];

const ADMIN_NAV_ITEMS = ADMIN_NAV.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })));

interface OverviewResponse {
  metrics: {
    gmv?: number;
    orders?: number;
    commission?: number;
    refunds?: number;
    pending_sellers?: number;
    pending_products?: number;
    open_refunds?: number;
    open_returns?: number;
    open_support?: number;
    unfulfilled?: number;
    active_products?: number;
    active_sellers?: number;
    customers?: number;
    real_orders?: number;
    demo_orders?: number;
    total_orders?: number;
    published_products?: number;
    draft_products?: number;
    rejected_products?: number;
    paused_products?: number;
    archived_products?: number;
    low_stock_products?: number;
    out_of_stock_products?: number;
  };
  recentOrders: {
    orderNumber: string;
    status: string;
    totalPaise: number;
    placedAt: string;
    email: string;
    sellerCount: number;
    isDemo?: boolean;
  }[];
  pendingSellers: { id: string; business_name: string; region: string | null; created_at: string; status: string }[];
  audits: { action: string; entity_type: string; entity_id: string; actor_email: string | null; created_at: string }[];
  lowStock: { name: string; seller_name: string; available: number; sku?: string }[];
  integrations: { payments: { provider: string; configured: boolean; mode: string }; shipping: string; email: string };
  notifications: { sent?: number; skipped?: number; failed?: number; pending?: number };
}

function queueCount(key: BadgeKey | undefined, metrics: OverviewResponse['metrics'] | undefined): number {
  if (!key) return 0;
  switch (key) {
    case 'sellers':
      return metrics?.pending_sellers ?? 0;
    case 'products':
      return metrics?.pending_products ?? 0;
    case 'refunds':
      return metrics?.open_refunds ?? 0;
    case 'returns':
      return metrics?.open_returns ?? 0;
    case 'support':
      return metrics?.open_support ?? 0;
    case 'unfulfilled':
      return metrics?.unfulfilled ?? 0;
  }
}

function initials(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/* ============================== ADMIN SHELL ============================== */

export function AdminLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const sidebarCloseRef = useRef<HTMLButtonElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const notificationsButtonRef = useRef<HTMLButtonElement>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement>(null);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const palettePanelRef = useRef<HTMLDivElement>(null);
  const paletteReturnFocusRef = useRef<HTMLElement | null>(null);

  const overview = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => api<OverviewResponse>('/admin/overview'),
    staleTime: 30_000,
  });
  const metrics = overview.data?.metrics;

  const currentNav = useMemo(() => {
    const match = ADMIN_NAV_ITEMS.filter((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)).sort(
      (a, b) => b.to.length - a.to.length,
    )[0];
    return match ?? ADMIN_NAV_ITEMS[0];
  }, [pathname]);

  usePageMeta({ title: `${currentNav.label} · Admin · Dear Hills` });

  const queues = useMemo(
    () => [
      {
        key: 'sellers' as const,
        label: 'Seller applications',
        count: metrics?.pending_sellers ?? 0,
        note: 'Submitted, under review or awaiting seller changes',
        to: '/admin/sellers?queue=review',
        icon: <NavIcon type="sellers" />,
      },
      {
        key: 'products' as const,
        label: 'Listing moderation',
        count: metrics?.pending_products ?? 0,
        note: 'Listings submitted by sellers and awaiting a decision',
        to: '/admin/products?status=pending',
        icon: <NavIcon type="products" />,
      },
      {
        key: 'refunds' as const,
        label: 'Refund queue',
        count: metrics?.open_refunds ?? 0,
        note: 'Requested, approved or processing refunds',
        to: '/admin/refunds?status=requested',
        icon: <NavIcon type="refunds" />,
      },
      {
        key: 'returns' as const,
        label: 'Return requests',
        count: metrics?.open_returns ?? 0,
        note: 'Customer returns waiting for a recorded decision',
        to: '/admin/returns?status=requested',
        icon: <NavIcon type="returns" />,
      },
      {
        key: 'support' as const,
        label: 'Support inbox',
        count: metrics?.open_support ?? 0,
        note: 'Open contact-form messages',
        to: '/admin/support?status=open',
        icon: <NavIcon type="support" />,
      },
      {
        key: 'unfulfilled' as const,
        label: 'Fulfilment backlog',
        count: metrics?.unfulfilled ?? 0,
        note: 'Seller shipments to confirm, pack or dispatch',
        to: '/admin/orders?fulfilment=open',
        icon: <NavIcon type="orders" />,
      },
    ],
    [metrics],
  );

  const attention = queues.filter((queue) => queue.count > 0);
  const attentionTotal = attention.reduce((sum, queue) => sum + queue.count, 0);

  const paletteResults = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase();
    if (!query) return ADMIN_NAV_ITEMS;
    return ADMIN_NAV_ITEMS.filter(
      (item) => item.label.toLowerCase().includes(query) || item.group.toLowerCase().includes(query),
    );
  }, [paletteQuery]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteQuery('');
        setPaletteIndex(0);
        setPaletteOpen((open) => !open);
        return;
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false);
        setNotificationsOpen(false);
        setUserMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen && !paletteOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileMenuOpen, paletteOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const timer = window.setTimeout(() => sidebarCloseRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!paletteOpen) return;
    paletteReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = window.setTimeout(() => paletteInputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      const target = paletteReturnFocusRef.current;
      if (target?.isConnected) target.focus();
    };
  }, [paletteOpen]);

  useEffect(() => {
    const main = document.getElementById('admin-main');
    const active = document.activeElement;
    if (main && active instanceof HTMLElement && active.closest('#admin-sidebar')) {
      main.focus();
    }
  }, [pathname]);

  const openPalette = () => {
    setPaletteQuery('');
    setPaletteIndex(0);
    setPaletteOpen(true);
  };

  const go = (to: string) => {
    setPaletteOpen(false);
    setPaletteQuery('');
    setMobileMenuOpen(false);
    setNotificationsOpen(false);
    navigate(to);
  };

  const onPaletteKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (paletteResults.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setPaletteIndex((index) => (index + 1) % paletteResults.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setPaletteIndex((index) => (index - 1 + paletteResults.length) % paletteResults.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = paletteResults[paletteIndex] ?? paletteResults[0];
      if (target) go(target.to);
    }
  };

  const onPalettePanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setPaletteOpen(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const panel = palettePanelRef.current;
    if (!panel) return;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    window.setTimeout(() => mobileMenuButtonRef.current?.focus(), 0);
  };

  const displayName = user?.fullName?.trim() || 'Administrator';
  const displayEmail = user?.email ?? '';

  return (
    <div className="min-h-screen bg-paper text-ink antialiased lg:flex">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:border focus:border-forest focus:bg-paper focus:px-4 focus:py-2 focus:text-sm focus:text-forest"
      >
        Skip to admin content
      </a>

      {/* Sidebar */}
      <aside
        id="admin-sidebar"
        aria-label="Admin navigation"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && mobileMenuOpen) {
            event.stopPropagation();
            closeMobileMenu();
          }
        }}
        className={`fixed inset-y-0 left-0 z-50 flex w-[276px] flex-col bg-orchard-deep text-paper shadow-2xl transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:translate-x-0 lg:shadow-none ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
          <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 focus-visible:outline-offset-4">
            <MountainLogoSvg />
            <span>
              <span className="block font-serif text-[17px] font-semibold tracking-[0.1em] text-paper">DEAR HILLS</span>
              <span className="mt-0.5 block text-[9px] font-medium uppercase tracking-[0.24em] text-butter/45">Marketplace admin</span>
            </span>
          </Link>
          <button
            ref={sidebarCloseRef}
            type="button"
            onClick={closeMobileMenu}
            className="flex h-8 w-8 items-center justify-center text-butter/70 hover:bg-white/10 hover:text-paper lg:hidden"
            aria-label="Close navigation"
          >
            <NavIcon type="close" className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Admin sections">
          {ADMIN_NAV.map((group) => (
            <div key={group.label} className="mb-5 last:mb-0">
              <p className="px-3 pb-2 text-[9px] font-semibold uppercase tracking-[0.22em] text-butter/35">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const count = queueCount(item.badge, metrics);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 border-l-2 px-3 py-2 text-[12.5px] transition-colors ${
                          isActive
                            ? 'border-harvest bg-paper font-semibold text-forest shadow-sm'
                            : 'border-transparent text-butter/75 hover:border-white/25 hover:bg-white/[0.05] hover:text-paper'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <NavIcon type={item.icon} className={`h-[17px] w-[17px] shrink-0 ${isActive ? 'text-forest' : 'text-butter/55'}`} />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {count > 0 ? (
                            <span
                              className={`min-w-5 border px-1 py-0.5 text-center text-[9.5px] font-semibold tabular-nums ${
                                isActive ? 'border-forest/20 bg-forest/[0.06] text-forest' : 'border-white/15 bg-white/10 text-butter'
                              }`}
                            >
                              {count > 99 ? '99+' : count}
                            </span>
                          ) : null}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <Link
            to="/"
            className="flex items-center justify-between gap-2 border border-white/15 px-3 py-2 text-[11.5px] text-butter/80 transition-colors hover:border-white/30 hover:bg-white/[0.05] hover:text-paper"
          >
            <span className="flex items-center gap-2">
              <NavIcon type="storefront" className="h-4 w-4" />
              View storefront
            </span>
            <span aria-hidden>↗</span>
          </Link>
          <p className="mt-3 text-[9.5px] leading-relaxed text-butter/35">
            Decisions, refunds and stock changes are written to the audit log with the signed-in administrator.
          </p>
        </div>
      </aside>

      {mobileMenuOpen ? (
        <button
          type="button"
          aria-label="Close navigation overlay"
          tabIndex={-1}
          onClick={closeMobileMenu}
          className="fixed inset-0 z-40 cursor-default bg-[#2b1a1f]/60 backdrop-blur-[1px] lg:hidden"
        />
      ) : null}

      {/* Main column */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
          <div className="flex h-16 items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
            <button
              ref={mobileMenuButtonRef}
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center border border-line bg-surface text-ink hover:border-forest/40 lg:hidden"
              aria-label="Open navigation"
              aria-controls="admin-sidebar"
              aria-expanded={mobileMenuOpen}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden>
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>

            <div className="min-w-0 flex-1">
              <p className="hidden text-[9px] font-semibold uppercase tracking-[0.2em] text-muted sm:block">
                {currentNav.group}
              </p>
              <p className="truncate font-serif text-lg leading-tight text-forest">{currentNav.label}</p>
            </div>

            <button
              type="button"
              onClick={openPalette}
              className="hidden h-9 w-full max-w-xs items-center gap-2 border border-line bg-surface px-3 text-left text-[11.5px] text-muted transition-colors hover:border-forest/40 md:flex"
              aria-label="Search admin sections"
            >
              <NavIcon type="search" className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 truncate">Search sections…</span>
              <kbd className="border border-line bg-paper px-1.5 py-0.5 font-sans text-[9px] uppercase tracking-wider text-muted">Ctrl K</kbd>
            </button>
            <button
              type="button"
              onClick={openPalette}
              className="flex h-9 w-9 shrink-0 items-center justify-center border border-line bg-surface text-muted hover:border-forest/40 md:hidden"
              aria-label="Search admin sections"
            >
              <NavIcon type="search" className="h-4 w-4" />
            </button>

            <Link
              to="/"
              className="hidden items-center gap-1.5 border border-line bg-surface px-3 py-2 text-[11px] font-medium text-ink transition-colors hover:border-forest/40 xl:flex"
            >
              <NavIcon type="storefront" className="h-3.5 w-3.5" />
              Storefront
            </Link>

            <div className="relative">
              <button
                ref={notificationsButtonRef}
                type="button"
                onClick={() => {
                  setNotificationsOpen((open) => !open);
                  setUserMenuOpen(false);
                }}
                className="relative flex h-9 w-9 items-center justify-center border border-line bg-surface text-ink transition-colors hover:border-forest/40"
                aria-label={
                  overview.isError
                    ? 'Queue counts unavailable'
                    : attentionTotal > 0
                      ? `${attentionTotal} items need attention`
                      : 'No queues need attention'
                }
                aria-expanded={notificationsOpen}
                aria-haspopup="dialog"
              >
                <NavIcon type="bell" className="h-4 w-4" />
                {attentionTotal > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-terra px-1 text-[9px] font-bold text-white">
                    {attentionTotal > 99 ? '99+' : attentionTotal}
                  </span>
                ) : null}
              </button>

              {notificationsOpen ? (
                <>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Close operational queues"
                    onClick={() => setNotificationsOpen(false)}
                    className="fixed inset-0 z-40 cursor-default bg-transparent"
                  />
                  <div
                    role="dialog"
                    aria-label="Operational queues"
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.stopPropagation();
                        setNotificationsOpen(false);
                        notificationsButtonRef.current?.focus();
                      }
                    }}
                    className="fixed inset-x-4 top-16 z-50 border border-line bg-paper shadow-2xl sm:absolute sm:inset-auto sm:right-0 sm:top-11 sm:w-[21rem]"
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
                      <div>
                        <p className="eyebrow">Needs attention</p>
                        <p className="mt-1 text-[12px] text-ink">
                          {overview.isLoading
                            ? 'Checking live queue counts…'
                            : overview.isError
                              ? 'Live queue counts are unavailable'
                              : attentionTotal > 0
                                ? `${attentionTotal} live item${attentionTotal === 1 ? '' : 's'} across the queues`
                                : 'All operational queues are clear'}
                        </p>
                      </div>
                      <span className="font-serif text-2xl text-forest">{attentionTotal}</span>
                    </div>
                    {attention.length ? (
                      <div className="max-h-80 overflow-y-auto">
                        {attention.map((queue) => (
                          <button
                            key={queue.key}
                            type="button"
                            onClick={() => go(queue.to)}
                            className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 hover:bg-surface"
                          >
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-terra/[0.08] text-terra">{queue.icon}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[12px] font-medium text-ink">{queue.label}</span>
                              <span className="block text-[10px] text-muted">{queue.note}</span>
                            </span>
                            <span className="border border-terra/25 bg-terra/[0.08] px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-[#8e4630]">
                              {queue.count}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="px-4 py-6 text-center text-sm text-muted">
                        {overview.isLoading
                          ? 'Checking queues…'
                          : overview.isError
                            ? 'Queue counts could not load. Open a queue directly from the sidebar.'
                            : 'Nothing is waiting for review right now.'}
                      </p>
                    )}
                    <div className="border-t border-line px-4 py-2.5">
                      <Link
                        to="/admin/audit"
                        onClick={() => setNotificationsOpen(false)}
                        className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-forest hover:text-terra"
                      >
                        Open audit log →
                      </Link>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <div className="relative">
              <button
                ref={userMenuButtonRef}
                type="button"
                onClick={() => {
                  setUserMenuOpen((open) => !open);
                  setNotificationsOpen(false);
                }}
                className="flex items-center gap-2 border border-transparent p-1 pr-1.5 transition-colors hover:border-line hover:bg-surface"
                aria-label="Account menu"
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest text-[10.5px] font-semibold text-paper">
                  {initials(displayName, displayEmail)}
                </span>
                <span className="hidden text-left lg:block">
                  <span className="block max-w-36 truncate text-[11.5px] font-medium leading-tight text-ink">{displayName}</span>
                  <span className="block text-[9.5px] uppercase tracking-[0.12em] text-muted">Administrator</span>
                </span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="hidden h-3 w-3 text-muted lg:block" aria-hidden>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {userMenuOpen ? (
                <>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Close account menu"
                    onClick={() => setUserMenuOpen(false)}
                    className="fixed inset-0 z-40 cursor-default bg-transparent"
                  />
                  <div
                    role="menu"
                    aria-label="Account"
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.stopPropagation();
                        setUserMenuOpen(false);
                        userMenuButtonRef.current?.focus();
                      }
                    }}
                    className="fixed inset-x-4 top-16 z-50 border border-line bg-paper shadow-2xl sm:absolute sm:inset-auto sm:right-0 sm:top-11 sm:w-64"
                  >
                    <div className="border-b border-line px-4 py-3">
                      <p className="truncate text-[12.5px] font-medium text-ink">{displayName}</p>
                      <p className="truncate text-[10.5px] text-muted">{displayEmail}</p>
                      <p className="mt-1 inline-flex border border-forest/20 bg-forest/[0.06] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-forest">
                        {user?.roles.includes('admin') ? 'Administrator access' : 'Restricted access'}
                      </p>
                    </div>
                    <Link
                      to="/account"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2.5 text-[12px] text-ink hover:bg-surface"
                    >
                      Account profile
                    </Link>
                    <Link
                      to="/"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2.5 text-[12px] text-ink hover:bg-surface"
                    >
                      Browse storefront
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={async () => {
                        setUserMenuOpen(false);
                        await signOut();
                      }}
                      className="block w-full border-t border-line px-4 py-2.5 text-left text-[12px] text-terra hover:bg-[#fff5f2]"
                    >
                      Sign out
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <main id="admin-main" tabIndex={-1} className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1440px]">
            <Outlet />
          </div>
        </main>

        <footer className="border-t border-line px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 text-[10px] text-muted">
            <p className="uppercase tracking-[0.16em]">DEAR HILLS · Marketplace operations console</p>
            <p>Server-enforced access · decisions audited</p>
          </div>
        </footer>
      </div>

      {/* Command palette */}
      {paletteOpen ? (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-[#2b1a1f]/55 px-4 pt-[10vh] backdrop-blur-[2px]">
          <button type="button" tabIndex={-1} aria-label="Close search" onClick={() => setPaletteOpen(false)} className="absolute inset-0 cursor-default" />
          <div
            ref={palettePanelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Search admin sections"
            onKeyDown={onPalettePanelKeyDown}
            className="relative w-full max-w-xl border border-line bg-paper shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <NavIcon type="search" className="h-4 w-4 shrink-0 text-muted" />
              <input
                ref={paletteInputRef}
                value={paletteQuery}
                onChange={(event) => {
                  setPaletteQuery(event.target.value);
                  setPaletteIndex(0);
                }}
                onKeyDown={onPaletteKeyDown}
                placeholder="Search admin sections…"
                aria-label="Search admin sections"
                className="h-14 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted/60"
              />
              <kbd className="border border-line bg-surface px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted">Esc</kbd>
            </div>
            <div className="max-h-[55vh] overflow-y-auto py-2">
              <p className="px-4 pb-1.5 pt-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-muted">
                {paletteQuery.trim() ? `${paletteResults.length} matching section${paletteResults.length === 1 ? '' : 's'}` : 'Jump to'}
              </p>
              {paletteResults.length ? (
                paletteResults.map((item, index) => {
                  const count = queueCount(item.badge, metrics);
                  const active = index === paletteIndex;
                  return (
                    <button
                      key={item.to}
                      type="button"
                      onMouseEnter={() => setPaletteIndex(index)}
                      onClick={() => go(item.to)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${active ? 'bg-forest text-paper' : 'text-ink hover:bg-surface'}`}
                    >
                      <NavIcon type={item.icon} className={`h-4 w-4 shrink-0 ${active ? 'text-butter' : 'text-muted'}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-medium">{item.label}</span>
                        <span className={`block text-[10px] ${active ? 'text-paper/60' : 'text-muted'}`}>{item.group}</span>
                      </span>
                      {count > 0 ? (
                        <span
                          className={`border px-1.5 py-0.5 text-[9.5px] font-semibold tabular-nums ${
                            active ? 'border-white/20 bg-white/10 text-paper' : 'border-terra/25 bg-terra/[0.08] text-[#8e4630]'
                          }`}
                        >
                          {count}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              ) : (
                <p className="px-4 py-8 text-center text-sm text-muted">No admin section matches “{paletteQuery.trim()}”.</p>
              )}
            </div>
            <p className="border-t border-line px-4 py-2 text-[10px] text-muted">
              This searches console destinations only. Search marketplace records inside each section.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ============================ ADMIN OVERVIEW ============================= */

export function AdminOverviewPage() {
  const overview = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => api<OverviewResponse>('/admin/overview'),
    staleTime: 30_000,
  });

  if (overview.isLoading) return <LoadingBlock rows={6} />;
  if (overview.isError || !overview.data) return <ErrorState title="Overview could not load" onRetry={() => void overview.refetch()} />;

  const data = overview.data;
  const m = data.metrics;

  const catalogue = [
    { label: 'Published', value: m.published_products ?? 0, bar: 'bg-forest' },
    { label: 'Awaiting review', value: m.pending_products ?? 0, bar: 'bg-harvest' },
    { label: 'Draft', value: m.draft_products ?? 0, bar: 'bg-apple-blossom' },
    { label: 'Rejected', value: m.rejected_products ?? 0, bar: 'bg-terra/70' },
    { label: 'Paused', value: m.paused_products ?? 0, bar: 'bg-harvest/50' },
    { label: 'Archived', value: m.archived_products ?? 0, bar: 'bg-ink/30' },
  ];
  const catalogueTotal = catalogue.reduce((sum, item) => sum + item.value, 0);

  const queues = [
    {
      key: 'sellers',
      label: 'Seller applications',
      count: m.pending_sellers ?? 0,
      note: 'Submitted, under review or awaiting seller changes',
      to: '/admin/sellers?queue=review',
      icon: <NavIcon type="sellers" />,
    },
    {
      key: 'products',
      label: 'Listing moderation',
      count: m.pending_products ?? 0,
      note: 'Listings submitted by sellers and awaiting a decision',
      to: '/admin/products?status=pending',
      icon: <NavIcon type="products" />,
    },
    {
      key: 'refunds',
      label: 'Refund queue',
      count: m.open_refunds ?? 0,
      note: 'Requested, approved or processing refunds',
      to: '/admin/refunds?status=requested',
      icon: <NavIcon type="refunds" />,
    },
    {
      key: 'returns',
      label: 'Return requests',
      count: m.open_returns ?? 0,
      note: 'Customer returns waiting for a recorded decision',
      to: '/admin/returns?status=requested',
      icon: <NavIcon type="returns" />,
    },
    {
      key: 'support',
      label: 'Support inbox',
      count: m.open_support ?? 0,
      note: 'Open contact-form messages',
      to: '/admin/support?status=open',
      icon: <NavIcon type="support" />,
    },
    {
      key: 'unfulfilled',
      label: 'Fulfilment backlog',
      count: m.unfulfilled ?? 0,
      note: 'Seller shipments to confirm, pack or dispatch',
      to: '/admin/orders?fulfilment=open',
      icon: <NavIcon type="orders" />,
    },
  ];
  const attentionTotal = queues.reduce((sum, queue) => sum + queue.count, 0);

  const payments = data.integrations.payments;
  const paymentLabel = payments.configured ? `${humanise(payments.provider)} · ${payments.mode}` : 'Not configured';
  const emailLabel = data.integrations.email === 'configured' ? 'SMTP configured' : 'SMTP not configured';
  const shippingLabel = data.integrations.shipping === 'configured' ? 'Credentials present · manual workflow' : 'Manual workflow only';
  const notificationLabel = data.notifications
    ? `${data.notifications.sent ?? 0} sent · ${data.notifications.skipped ?? 0} skipped · ${data.notifications.failed ?? 0} failed`
    : 'No notification records';

  return (
    <AdminPage>
      <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Operations overview</p>
          <h1 className="mt-2 text-3xl leading-tight sm:text-4xl">Marketplace overview</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Live trade, catalogue and review queues from this server. No placeholder totals or trend estimates are shown.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10.5px] text-muted">
            Updated {overview.dataUpdatedAt ? new Date(overview.dataUpdatedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—'}
          </span>
          <Button variant="secondary" size="sm" loading={overview.isFetching} onClick={() => void overview.refetch()}>
            Refresh
          </Button>
          <LinkButton to="/admin/sellers?queue=review" size="sm">Review sellers</LinkButton>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetric
          label="Real GMV · 30 days"
          value={formatINR(m.gmv ?? 0)}
          note={`${m.orders ?? 0} paid order${(m.orders ?? 0) === 1 ? '' : 's'} in the last 30 days · demo orders excluded`}
          tone="accent"
          icon={<NavIcon type="commissions" className="h-4 w-4" />}
          to="/admin/orders"
        />
        <AdminMetric
          label="Paid orders · 30 days"
          value={(m.orders ?? 0).toLocaleString('en-IN')}
          note={`${(m.real_orders ?? 0).toLocaleString('en-IN')} real orders on record · ${(m.demo_orders ?? 0).toLocaleString('en-IN')} demo`}
          icon={<NavIcon type="orders" className="h-4 w-4" />}
          to="/admin/orders?isDemo=false"
        />
        <AdminMetric
          label="Platform Fee · 30 days"
          value={formatINR(m.commission ?? 0)}
          note="Booked on paid orders, excluding cancelled seller shipments"
          icon={<NavIcon type="commissions" className="h-4 w-4" />}
          to="/admin/commissions"
        />
        <AdminMetric
          label="Registered customers"
          value={(m.customers ?? 0).toLocaleString('en-IN')}
          note={`${(m.active_sellers ?? 0).toLocaleString('en-IN')} approved sellers · ${(m.active_products ?? 0).toLocaleString('en-IN')} published listings`}
          icon={<NavIcon type="customers" className="h-4 w-4" />}
          to="/admin/customers"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <AdminSection
          title="Needs attention"
          description="Each count comes from the operational database and links to the queue that resolves it."
          action={
            <span className={`border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${attentionTotal > 0 ? 'border-terra/25 bg-terra/[0.06] text-[#8e4630]' : 'border-sage/30 bg-sage/10 text-muted'}`}>
              {attentionTotal > 0 ? `${attentionTotal} open` : 'Queues clear'}
            </span>
          }
          bodyClassName="p-0"
        >
          {queues.map((queue) => (
            <AdminQueueRow key={queue.key} label={queue.label} count={queue.count} note={queue.note} to={queue.to} icon={queue.icon} />
          ))}
        </AdminSection>

        <div className="space-y-4">
          <AdminSection title="Catalogue composition" description="Every listing currently stored, grouped by moderation state.">
            {catalogueTotal > 0 ? (
              <>
                <div className="flex h-3 w-full overflow-hidden border border-line bg-paper" aria-hidden>
                  {catalogue.map((item) =>
                    item.value > 0 ? (
                      <span key={item.label} className={item.bar} style={{ width: `${(item.value / catalogueTotal) * 100}%` }} />
                    ) : null,
                  )}
                </div>
                <dl className="mt-4 space-y-2.5">
                  {catalogue.map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-3 text-[11.5px]">
                      <dt className="flex items-center gap-2 text-muted">
                        <span className={`h-2 w-2 ${item.bar}`} aria-hidden />
                        {item.label}
                      </dt>
                      <dd className="font-medium tabular-nums text-ink">
                        {item.value.toLocaleString('en-IN')}
                        <span className="ml-2 text-[10px] text-muted">{Math.round((item.value / catalogueTotal) * 100)}%</span>
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[11px]">
                  <Link to="/admin/products?lowStock=true" className="text-muted underline underline-offset-2 hover:text-forest">
                    Low stock / out of stock
                  </Link>
                  <span className="font-medium text-ink">
                    {(m.low_stock_products ?? 0).toLocaleString('en-IN')} / {(m.out_of_stock_products ?? 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">No catalogue records yet. Listings appear here after a seller submits a product.</p>
            )}
          </AdminSection>

          <AdminSection title="Service readiness" description="Configuration reported by the server. Unconfigured providers are not presented as working.">
            <dl className="space-y-2.5 text-[11.5px]">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted">Payments</dt>
                <dd className="text-right">
                  <span className={`inline-flex border px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] ${payments.configured ? 'border-forest/20 bg-forest/[0.06] text-forest' : 'border-terra/25 bg-terra/[0.06] text-[#8e4630]'}`}>
                    {paymentLabel}
                  </span>
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted">Email</dt>
                <dd className="text-right text-ink">{emailLabel}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted">Shipping</dt>
                <dd className="text-right text-ink">{shippingLabel}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted">Notification queue</dt>
                <dd className="max-w-[60%] text-right text-ink">{notificationLabel}</dd>
              </div>
            </dl>
            <Link to="/admin/settings" className="mt-4 inline-block text-[10.5px] font-medium uppercase tracking-[0.14em] text-forest hover:text-terra">
              View configuration →
            </Link>
          </AdminSection>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <AdminSection
          title="Recent orders"
          description="The latest orders across real and clearly labelled demo test traffic."
          action={<Link to="/admin/orders" className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-forest hover:text-terra">All orders →</Link>}
          bodyClassName="p-0"
        >
          {data.recentOrders.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[12.5px]" aria-label="Recent orders">
                <thead className="border-b border-line bg-paper text-[9.5px] uppercase tracking-[0.14em] text-muted">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">Order</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Customer</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Total</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Placed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.recentOrders.map((order) => (
                    <tr key={order.orderNumber} className="hover:bg-paper/60">
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link to={`/admin/orders/${order.orderNumber}`} className="font-medium text-forest hover:text-terra">
                            {order.orderNumber}
                          </Link>
                          {order.isDemo ? <Badge tone="sand">Demo</Badge> : null}
                        </div>
                        <p className="text-[10px] text-muted">{order.sellerCount} seller shipment{order.sellerCount === 1 ? '' : 's'}</p>
                      </td>
                      <td className="max-w-44 truncate px-5 py-3.5 text-muted">{order.email}</td>
                      <td className="px-5 py-3.5"><StatusBadge status={order.status} label={orderStatusLabel(order.status)} /></td>
                      <td className="px-5 py-3.5 font-medium tabular-nums">{formatINR(order.totalPaise)}</td>
                      <td className="px-5 py-3.5 text-muted">{formatDate(order.placedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <EmptyState title="No orders yet" body="Orders will appear here as soon as a customer completes a verified checkout." />
            </div>
          )}
        </AdminSection>

        <div className="space-y-4">
          <AdminSection
            title="Seller review queue"
            description="The oldest applications waiting for a reviewer."
            action={<Link to="/admin/sellers?queue=review" className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-forest hover:text-terra">Open queue →</Link>}
            bodyClassName="p-0"
          >
            {data.pendingSellers.length ? (
              <ul className="divide-y divide-line">
                {data.pendingSellers.map((seller) => (
                  <li key={seller.id} className="px-5 py-3">
                    <Link to={`/admin/sellers/${seller.id}`} className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-medium text-forest">{seller.business_name}</span>
                        <span className="block text-[10px] text-muted">{seller.region ?? 'Region not recorded'} · applied {formatDate(seller.created_at)}</span>
                      </span>
                      <StatusBadge status={seller.status} label={applicationQueueLabel(seller.status)} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-muted">No seller applications are waiting for review.</p>
            )}
          </AdminSection>

          <AdminSection
            title="Low stock"
            description="Published listings at or below their stock threshold."
            action={<Link to="/admin/products?lowStock=true" className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-forest hover:text-terra">Open →</Link>}
            bodyClassName="p-0"
          >
            {data.lowStock.length ? (
              <ul className="divide-y divide-line">
                {data.lowStock.slice(0, 5).map((item) => (
                  <li key={`${item.name}-${item.seller_name}`} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-medium text-ink">{item.name}</span>
                      <span className="block text-[10px] text-muted">{item.seller_name}{item.sku ? ` · ${item.sku}` : ''}</span>
                    </span>
                    <span className={`shrink-0 border px-2 py-0.5 text-[10px] font-semibold ${item.available <= 0 ? 'border-terra/25 bg-terra/[0.08] text-[#8e4630]' : 'border-harvest/40 bg-[#fbf4e4] text-[#7c5a1c]'}`}>
                      {item.available <= 0 ? 'Out of stock' : `${item.available} left`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-muted">No published listing is below its stock threshold.</p>
            )}
          </AdminSection>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <AdminSection
          title="Recent admin activity"
          description="The latest recorded actions. The audit log retains the actor and before/after state."
          action={<Link to="/admin/audit" className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-forest hover:text-terra">Audit log →</Link>}
          bodyClassName="p-0"
        >
          {data.audits.length ? (
            <ul className="divide-y divide-line">
              {data.audits.map((entry, index) => (
                <li key={`${entry.action}-${entry.created_at}-${index}`} className="flex items-start justify-between gap-3 px-5 py-3">
                  <span className="min-w-0">
                    <span className="block text-[12px] font-medium text-ink">{humanise(entry.action.replaceAll('.', ' '))}</span>
                    <span className="block text-[10px] text-muted">
                      {entry.entity_type} · {entry.actor_email ?? 'system'} · {formatDateTime(entry.created_at)}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[9.5px] text-muted">{entry.entity_id.slice(0, 12)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted">No administrator actions have been recorded yet.</p>
          )}
        </AdminSection>

        <AdminSection title="Operator shortcuts" description="Cross-checks worth running before launch and during daily operations.">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Review sellers', to: '/admin/sellers?queue=review', icon: 'sellers' },
              { label: 'Moderate listings', to: '/admin/products?status=pending', icon: 'products' },
              { label: 'Refund queue', to: '/admin/refunds?status=requested', icon: 'refunds' },
              { label: 'Support inbox', to: '/admin/support?status=open', icon: 'support' },
              { label: 'Settlements', to: '/admin/settlements', icon: 'settlements' },
              { label: 'System settings', to: '/admin/settings', icon: 'settings' },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-2.5 border border-line bg-paper px-3 py-3 text-[11.5px] font-medium text-ink transition-colors hover:border-forest/35 hover:bg-surface"
              >
                <NavIcon type={item.icon} className="h-4 w-4 shrink-0 text-forest" />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
          <p className="mt-4 border-t border-line pt-3 text-[10.5px] leading-relaxed text-muted">
            Payouts are recorded manually against a real bank or UPI reference. This console does not initiate automated
            transfers, and demo orders are never counted as marketplace revenue.
          </p>
        </AdminSection>
      </div>
    </AdminPage>
  );
}

function applicationQueueLabel(status: string): string {
  return APPLICATION_STATUS_LABELS[status as ApplicationStatus] ?? humanise(status);
}

/* ============================ SELLERS & PRODUCTS ========================= */

interface SellerRow {
  id: string; business_name: string; slug: string; status: string; seller_type: string; region: string | null;
  created_at: string; approved_at: string | null; email: string; product_count: number; paid_orders: number; gmv: number;
  store_status: string; payout_status: string; seller_category: string | null;
  application_id: string | null;
  application_status: string | null; application_revision: number | null; application_current_step: number | null;
  submitted_at: string | null;
}

interface SellerListResponse {
  sellers: SellerRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filters?: { region?: string[]; seller_category?: string[]; seller_type?: string[] };
}

function sellerApplicationStatus(seller: SellerRow): string {
  return seller.application_status ?? seller.status;
}

function applicationLabel(status: string): string {
  return APPLICATION_STATUS_LABELS[status as ApplicationStatus] ?? humanise(status);
}

export function AdminSellersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') ?? '';
  const queue = searchParams.get('queue') ?? '';
  const region = searchParams.get('region') ?? '';
  const sellerCategory = searchParams.get('sellerCategory') ?? '';
  const sellerType = searchParams.get('sellerType') ?? '';
  const [q, setQ] = useState('');
  const deferredQ = useDeferredValue(q.trim());
  const [page, setPage] = useState(1);

  const sellers = useQuery({
    queryKey: ['admin-sellers', status, queue, region, sellerCategory, sellerType, deferredQ, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (status) params.set('status', status);
      if (queue) params.set('queue', queue);
      if (region) params.set('region', region);
      if (sellerCategory) params.set('sellerCategory', sellerCategory);
      if (sellerType) params.set('sellerType', sellerType);
      if (deferredQ) params.set('q', deferredQ);
      return api<SellerListResponse>(`/admin/sellers?${params.toString()}`);
    },
  });

  const rows = useMemo(() => sellers.data?.sellers ?? [], [sellers.data]);
  const total = sellers.data?.total ?? 0;

  const overview = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => api<OverviewResponse>('/admin/overview'),
    staleTime: 30_000,
  });
  const reviewCount = overview.data?.metrics.pending_sellers ?? 0;

  const setFilter = (next: { status?: string; queue?: string; region?: string; sellerCategory?: string; sellerType?: string }) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    setPage(1);
    setSearchParams(params, { replace: true });
  };

  const clearFilters = () => {
    setQ('');
    setPage(1);
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Maker verification"
        title="Seller applications"
        lede="Review the saved application, category-specific evidence and trading history before approving a maker. Every decision records an actor and reason."
        actions={<LinkButton to="/admin/settlements" variant="secondary" size="sm">Seller settlements</LinkButton>}
      />

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <Field label="Search sellers" className="w-full sm:max-w-xs">
          <Input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder="Business, email, region, category or application ref"
            type="search"
          />
        </Field>
        <Field label="Application status">
          <Select value={status} onChange={(event) => setFilter({ status: event.target.value })} className="max-w-56">
            <option value="">All statuses</option>
            {['draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'rejected', 'suspended', 'withdrawn'].map((value) => (
              <option key={value} value={value}>{applicationLabel(value)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Region">
          <Select
            value={region}
            onChange={(event) => setFilter({ region: event.target.value })}
            className="max-w-44"
            aria-label="Filter by region"
          >
            <option value="">All regions</option>
            {(sellers.data?.filters?.region ?? []).map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </Select>
        </Field>
        <Field label="Maker category">
          <Select
            value={sellerCategory}
            onChange={(event) => setFilter({ sellerCategory: event.target.value })}
            className="max-w-52"
            aria-label="Filter by maker category"
          >
            <option value="">All categories</option>
            {(sellers.data?.filters?.seller_category ?? []).map((value) => (
              <option key={value} value={value}>{humanise(value)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Legal type">
          <Select
            value={sellerType}
            onChange={(event) => setFilter({ sellerType: event.target.value })}
            className="max-w-48"
            aria-label="Filter by seller legal type"
          >
            <option value="">All types</option>
            {(sellers.data?.filters?.seller_type ?? []).map((value) => (
              <option key={value} value={value}>{humanise(value)}</option>
            ))}
          </Select>
        </Field>
        <Button
          type="button"
          size="sm"
          variant={queue === 'review' ? 'primary' : 'secondary'}
          onClick={() => setFilter({ queue: queue === 'review' ? '' : 'review' })}
          className="mb-0.5"
        >
          Needs review{reviewCount ? ` · ${reviewCount}` : ''}
        </Button>
        <p className="pb-3 text-[11px] text-muted sm:ml-auto">
          {total} seller{total === 1 ? '' : 's'} in this view
          {sellers.data && sellers.data.totalPages > 1 ? ` · page ${page} of ${sellers.data.totalPages}` : ''}
        </p>
      </div>

      <div className="mt-5">
        {sellers.isLoading ? <LoadingBlock rows={4} /> : null}
        {sellers.isError ? <ErrorState onRetry={() => void sellers.refetch()} /> : null}
        {sellers.data && rows.length ? (
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="min-w-full text-left text-[12.5px]" aria-label="Seller applications">
              <thead className="border-b border-line bg-paper text-[9.5px] uppercase tracking-[0.14em] text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Seller</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Application</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Store</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Category</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Listings</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Paid orders</th>
                  <th scope="col" className="px-4 py-3 font-semibold">GMV</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((seller) => {
                  const applicationStatus = sellerApplicationStatus(seller);
                  return (
                    <tr key={seller.id} className="hover:bg-paper/60">
                      <td className="px-4 py-4">
                        <Link to={`/admin/sellers/${seller.id}`} className="font-medium text-forest hover:text-terra">
                          {seller.business_name}
                        </Link>
                        <p className="mt-0.5 text-[10.5px] text-muted">{seller.email} · {seller.region ?? 'Region not recorded'}</p>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={applicationStatus} label={applicationLabel(applicationStatus)} />
                        <p className="mt-1 text-[10.5px] text-muted">
                          {seller.submitted_at ? `Submitted ${formatDate(seller.submitted_at)}` : `Step ${seller.application_current_step ?? 1} of 10 · draft`}
                          {seller.application_revision && seller.application_revision > 1 ? ` · revision ${seller.application_revision}` : ''}
                        </p>
                        {seller.application_id ? (
                          <p className="mt-1 break-all font-mono text-[10px] text-muted" title={seller.application_id}>
                            Ref {seller.application_id}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-ink">{STORE_STATUS_LABELS[seller.store_status] ?? humanise(seller.store_status)}</span>
                        <p className="text-[10.5px] text-muted">Payouts: {humanise(seller.payout_status)}</p>
                      </td>
                      <td className="px-4 py-4 text-muted">
                        {seller.seller_category ? humanise(seller.seller_category) : '—'}
                        <p className="text-[10.5px]">{humanise(seller.seller_type)}</p>
                      </td>
                      <td className="px-4 py-4 tabular-nums">{seller.product_count}</td>
                      <td className="px-4 py-4 tabular-nums">{seller.paid_orders}</td>
                      <td className="px-4 py-4 tabular-nums">{formatINR(seller.gmv)}</td>
                      <td className="px-4 py-4 text-muted">{formatDate(seller.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {sellers.data && !rows.length ? (
          <EmptyState
            eyebrow={queue === 'review' ? 'Queue clear' : undefined}
            title={queue === 'review' ? 'No applications need review' : 'No sellers match this view'}
            body={
              queue === 'review'
                ? 'Submitted and re-opened applications appear here. Approved sellers can be found under All statuses.'
                : 'Try a different status, region or search term, or clear the filters to see every seller account.'
            }
            action={<Button variant="secondary" size="sm" onClick={clearFilters}>Clear filters</Button>}
          />
        ) : null}
        {sellers.data ? (
          <Pagination page={page} totalPages={sellers.data.totalPages} onChange={setPage} />
        ) : null}
      </div>
    </div>
  );
}

interface AdminApplicationRecord {
  id: string;
  status: ApplicationStatus;
  revision: number;
  current_step: number;
  business_name: string;
  seller_type: string;
  seller_category: string | null;
  categories?: unknown;
  address?: unknown;
  gstin: string | null;
  phone: string | null;
  notes: string | null;
  data?: Record<string, unknown>;
  verification?: Record<string, unknown> | null;
  shipping?: Record<string, unknown> | null;
  payout?: Record<string, unknown> | null;
  agreement?: Record<string, unknown> | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  last_saved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AdminApplicationEventRow {
  id: string;
  event: string;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  actor_email: string | null;
  created_at: string;
}

interface AdminAuditRow {
  id: string;
  action: string;
  actor_email: string | null;
  before_json: string | null;
  after_json: string | null;
  created_at: string;
}

const ADMIN_EVENT_LABELS: Record<string, string> = {
  draft_started: 'Draft started',
  application_submitted: 'Application submitted',
  document_uploaded: 'Document uploaded',
  admin_start_review: 'Review started',
  admin_request_changes: 'Changes requested',
  admin_approve: 'Application approved',
  admin_reject: 'Application not approved',
  admin_suspend: 'Store suspended',
  admin_reinstate: 'Store reinstated',
  admin_request_reverification: 'Re-verification requested',
  document_reviewed: 'Document reviewed',
};

interface AdminSellerDetail {
  seller: Record<string, unknown> & {
    id: string;
    business_name: string;
    status: string;
    store_status?: string;
    store_status_reason?: string | null;
    payout_status?: string;
    seller_category?: string | null;
    rejection_reason?: string | null;
    operatingAddress?: unknown;
    email?: string;
    emailVerified?: boolean;
    accountCreatedAt?: string;
  };
  application: AdminApplicationRecord | null;
  documents: {
    id: string;
    doc_type: string;
    docLabel?: string | null;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    status: string;
    review_note?: string | null;
    uploaded_at: string;
  }[];
  events?: AdminApplicationEventRow[];
  auditTrail?: AdminAuditRow[];
  requirements?: { required: string[]; optional: string[]; missing: string[]; labels: Record<string, string> };
  checklist?: { id: string; label: string; status: string; detail: string; href?: string }[];
  metrics: { active_products?: number; pending_products?: number; paid_orders?: number; delivered_orders?: number; gross?: number; commission?: number; eligible?: number; settled?: number };
  recentOrders: { reference: string; status: string; total_paise: number; created_at: string; order_number: string }[];
  commissionRules: { rate_bp: number } | null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : value === null || value === undefined ? '—' : String(value);
}
function valueList(value: unknown): string {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string').join(', ') || '—';
  if (typeof value === 'string') return value.trim() || '—';
  return '—';
}
function numberText(value: unknown): string {
  return typeof value === 'number' ? value.toLocaleString('en-IN') : '—';
}

export function AdminSellerDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [documentTarget, setDocumentTarget] = useState<{ id: string; label: string } | null>(null);
  const [documentNote, setDocumentNote] = useState('');
  const [documentBusy, setDocumentBusy] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const detail = useQuery({
    queryKey: ['admin-seller', id],
    queryFn: () => api<AdminSellerDetail>(`/admin/sellers/${id}`),
    enabled: Boolean(id),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-seller', id] });
    await queryClient.invalidateQueries({ queryKey: ['admin-sellers'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
  };

  const decide = async () => {
    if (!decision) return;
    if (['reject', 'request_changes', 'suspend', 'request_reverification'].includes(decision) && reason.trim().length < 5) {
      toast.push('Record a reason of at least 5 characters.', 'error');
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/sellers/${id}/decision`, { method: 'POST', body: { decision, reason: reason || undefined } });
      toast.push(`Seller decision recorded: ${humanise(decision)}.`);
      setDecision(null);
      setReason('');
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const decideDocument = async (documentId: string, status: 'accepted' | 'rejected', note?: string) => {
    setDocumentBusy(true);
    try {
      await api(`/admin/seller-documents/${documentId}/status`, { method: 'POST', body: { status, note } });
      toast.push(status === 'accepted' ? 'Document accepted. The seller has been notified.' : 'Document rejected with a note for the seller.');
      setDocumentTarget(null);
      setDocumentNote('');
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setDocumentBusy(false);
    }
  };

  const recordAdjustment = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Math.round(Number(adjustAmount) * 100);
    if (!amount || Number.isNaN(amount)) {
      toast.push('Enter a non-zero amount.', 'error');
      return;
    }
    if (adjustNote.trim().length < 5) {
      toast.push('Add a note (at least 5 characters).', 'error');
      return;
    }
    try {
      await api(`/admin/sellers/${id}/adjustments`, { method: 'POST', body: { amountPaise: amount, note: adjustNote } });
      toast.push('Ledger adjustment recorded.');
      setAdjustAmount('');
      setAdjustNote('');
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    }
  };

  if (detail.isLoading) return <LoadingBlock rows={4} />;
  if (detail.isError || !detail.data) return <ErrorState title="Seller not found" onRetry={() => void detail.refetch()} />;
  const data = detail.data;
  const seller = data.seller;
  const metrics = data.metrics;
  const application = data.application;
  const applicationStatus = application?.status ?? (String(seller.status) as ApplicationStatus);
  const reviewable = application && application.status !== 'draft';
  const canStartReview = applicationStatus === 'submitted';
  const canRequestChanges = ['submitted', 'under_review'].includes(applicationStatus);
  const canApprove = ['submitted', 'under_review', 'changes_requested', 'suspended'].includes(applicationStatus);
  const canReject = ['submitted', 'under_review', 'changes_requested'].includes(applicationStatus);
  const canSuspend = ['approved', 'under_review'].includes(applicationStatus);
  const canReinstate = applicationStatus === 'suspended';
  const canReverify = applicationStatus === 'approved';
  const appData = application?.data ?? {};
  const shipping = (application?.shipping ?? {}) as Record<string, unknown>;
  const payout = (application?.payout ?? {}) as Record<string, unknown>;
  const agreement = (application?.agreement ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Seller file"
        title={String(seller.business_name)}
        lede={`${text(seller.email)} · ${text(seller.region)} · created ${formatDate(text(seller.created_at))}`}
        actions={<StatusBadge status={applicationStatus} label={applicationLabel(applicationStatus)} />}
      />
      <div className="flex flex-wrap gap-2">
        {canStartReview ? <Button variant="secondary" onClick={() => setDecision('start_review')}>Start review</Button> : null}
        {canApprove ? <Button onClick={() => setDecision('approve')}>{applicationStatus === 'suspended' ? 'Reinstate & approve' : 'Approve seller'}</Button> : null}
        {canRequestChanges ? <Button variant="secondary" onClick={() => setDecision('request_changes')}>Request changes</Button> : null}
        {canSuspend ? <Button variant="danger" onClick={() => setDecision('suspend')}>Suspend store</Button> : null}
        {canReinstate ? <Button onClick={() => setDecision('reinstate')}>Reinstate seller</Button> : null}
        {canReverify ? <Button variant="secondary" onClick={() => setDecision('request_reverification')}>Request re-verification</Button> : null}
        {canReject ? <Button variant="ghost" onClick={() => setDecision('reject')}>Reject application</Button> : null}
      </div>
      {!reviewable ? (
        <Alert tone="info" title="Draft application">
          This seller has not submitted the application yet. Decisions are disabled until they submit, and draft content is shown for information only.
        </Alert>
      ) : null}
      {seller.rejection_reason ? <Alert tone="warning" title="Current reviewer note">{String(seller.rejection_reason)}</Alert> : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Live products" value={metrics.active_products ?? 0} />
        <Stat label="Paid orders" value={metrics.paid_orders ?? 0} />
        <Stat label="Product value" value={formatINR(metrics.gross ?? 0)} />
        <Stat label="Eligible to settle" value={formatINR(metrics.eligible ?? 0)} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <section className="border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg">Application</h2>
              <span className="text-[11px] text-muted">
                {application ? `Revision ${application.revision} · step ${application.current_step} of 10` : 'No record'}
              </span>
            </div>
            {application ? (
              <>
                <dl className="mt-4 grid gap-3 text-[12.5px] sm:grid-cols-2">
                  <div><dt className="text-muted">Status</dt><dd className="mt-0.5">{applicationLabel(application.status)}</dd></div>
                  <div><dt className="text-muted">Submitted</dt><dd className="mt-0.5">{application.submitted_at ? formatDateTime(application.submitted_at) : 'Not submitted'}</dd></div>
                  <div><dt className="text-muted">Last reviewed</dt><dd className="mt-0.5">{application.reviewed_at ? formatDateTime(application.reviewed_at) : 'Not yet reviewed'}</dd></div>
                  <div><dt className="text-muted">Last saved</dt><dd className="mt-0.5">{application.last_saved_at ? formatDateTime(application.last_saved_at) : '—'}</dd></div>
                  <div><dt className="text-muted">Seller category</dt><dd className="mt-0.5">{humanise(application.seller_category ?? String(seller.seller_category ?? ''))}</dd></div>
                  <div><dt className="text-muted">Business type</dt><dd className="mt-0.5">{humanise(application.seller_type)}</dd></div>
                  <div><dt className="text-muted">Phone</dt><dd className="mt-0.5">{text(application.phone)}</dd></div>
                  <div><dt className="text-muted">GSTIN</dt><dd className="mt-0.5">{text(application.gstin)}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-muted">Shop categories</dt><dd className="mt-0.5">{valueList(application.categories)}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-muted">Product groups</dt><dd className="mt-0.5">{valueList(appData.productGroups)}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-muted">Address</dt><dd className="mt-0.5 whitespace-pre-wrap">{typeof application.address === 'object' && application.address ? Object.values(application.address as Record<string, unknown>).filter(Boolean).join(', ') : '—'}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-muted">Origin & authenticity narrative</dt><dd className="mt-0.5 whitespace-pre-wrap">{text(appData.originNarrative)}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-muted">Reviewer note</dt><dd className="mt-0.5">{text(application.rejection_reason)}</dd></div>
                </dl>
                <div className="mt-5 grid gap-4 border-t border-line pt-4 text-[12.5px] sm:grid-cols-3">
                  <div>
                    <p className="eyebrow">Shipping</p>
                    <p className="mt-1">Dispatch within {text(shipping.dispatchDays)} days</p>
                    <p className="mt-0.5 text-muted">{text(shipping.packaging)}</p>
                  </div>
                  <div>
                    <p className="eyebrow">Payout preference</p>
                    <p className="mt-1">{humanise(text(payout.method))}</p>
                    <p className="mt-0.5 text-muted">{text(payout.accountHolderName)} · {payout.accountLast4 ? `····${text(payout.accountLast4)}` : text(payout.upiIdMasked)}</p>
                    <p className="mt-0.5 text-[10.5px] text-muted">Provider not configured — manual settlement only.</p>
                  </div>
                  <div>
                    <p className="eyebrow">Agreements</p>
                    <p className="mt-1">Version {text(agreement.version)}</p>
                    <p className="mt-0.5 text-muted">
                      {agreement.sellerAgreement ? 'Seller terms accepted' : 'Seller terms not accepted'}
                    </p>
                  </div>
                </div>
              </>
            ) : <p className="mt-3 text-sm text-muted">No application record.</p>}
          </section>

          {data.checklist?.length ? (
            <section className="border border-line bg-surface p-5">
              <h2 className="text-lg">Onboarding checklist</h2>
              <p className="mt-1 text-[11px] text-muted">Derived from the saved application and documents.</p>
              <ul className="mt-3 divide-y divide-line text-[12.5px]">
                {data.checklist.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                    <div>
                      <p className="text-ink">{item.label}</p>
                      <p className="mt-0.5 text-[10.5px] text-muted">{item.detail}</p>
                    </div>
                    <span className={item.status === 'complete' ? 'text-forest' : item.status === 'action' ? 'text-terra' : 'text-muted'}>
                      {item.status === 'complete' ? 'Complete' : item.status === 'action' ? 'Action needed' : 'Pending'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.requirements?.required.length ? (
            <section className="border border-line bg-surface p-5">
              <h2 className="text-lg">Evidence requirements</h2>
              <p className="mt-1 text-[11px] text-muted">Required for this category and structure. Requirement sets are not a legal determination.</p>
              <ul className="mt-3 space-y-1.5 text-[12.5px]">
                {data.requirements.required.map((type) => {
                  const missing = data.requirements!.missing.includes(type);
                  return (
                    <li key={type} className="flex items-center justify-between gap-3">
                      <span>{data.requirements!.labels[type] ?? humanise(type)}</span>
                      <span className={missing ? 'text-terra' : 'text-forest'}>{missing ? 'Missing' : 'Uploaded'}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="border border-line bg-surface p-5">
            <h2 className="text-lg">Verification documents</h2>
            <p className="mt-1 text-[11px] text-muted">Identity evidence is private. Opening a file is recorded in the audit log.</p>
            {data.documents.length ? (
              <ul className="mt-4 divide-y divide-line text-[12.5px]">
                {data.documents.map((document) => (
                  <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{document.docLabel ?? humanise(document.doc_type)}</p>
                      <p className="text-[10.5px] text-muted">{document.original_name} · {Math.round(document.size_bytes / 1024)} KB · {formatDate(document.uploaded_at)}</p>
                      {document.review_note ? <p className="mt-1 text-[10.5px] text-terra">Note: {document.review_note}</p> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={document.status} />
                      <a href={`/api/admin/seller-documents/${document.id}/file`} target="_blank" rel="noreferrer" className="text-[11px] text-forest underline underline-offset-2">
                        Open {document.docLabel ?? humanise(document.doc_type)}
                      </a>
                      <Button size="sm" variant="ghost" onClick={() => void decideDocument(document.id, 'accepted')}>Accept</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDocumentTarget({ id: document.id, label: document.docLabel ?? humanise(document.doc_type) });
                          setDocumentNote('');
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-muted">No documents uploaded.</p>}
          </section>

          <section className="border border-line bg-surface p-5">
            <h2 className="text-lg">Review history</h2>
            {data.events?.length ? (
              <ol className="mt-3 space-y-3 border-l border-line pl-4 text-[12.5px]">
                {data.events.map((event) => (
                  <li key={event.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-harvest" aria-hidden />
                    <p className="text-ink">{ADMIN_EVENT_LABELS[event.event] ?? humanise(event.event)}</p>
                    <p className="text-[10.5px] text-muted">
                      {formatDateTime(event.created_at)}
                      {event.from_status || event.to_status ? ` · ${event.from_status ? applicationLabel(event.from_status) : '—'} → ${event.to_status ? applicationLabel(event.to_status) : '—'}` : ''}
                      {event.actor_email ? ` · ${event.actor_email}` : ''}
                    </p>
                    {event.reason ? <p className="mt-1 text-[11.5px] text-bark">{event.reason}</p> : null}
                  </li>
                ))}
              </ol>
            ) : <p className="mt-3 text-sm text-muted">No application events recorded.</p>}
          </section>

          <section className="border border-line bg-surface p-5">
            <h2 className="text-lg">Audit trail</h2>
            <p className="mt-1 text-[11px] text-muted">Server-recorded administrator actions for this seller.</p>
            {data.auditTrail?.length ? (
              <ul className="mt-3 divide-y divide-line text-[12px]">
                {data.auditTrail.map((entry) => (
                  <li key={entry.id} className="py-2.5">
                    <p className="text-ink">{humanise(entry.action.replace('seller.', ''))} <span className="text-muted">· {entry.actor_email ?? 'system'}</span></p>
                    <p className="text-[10.5px] text-muted">{formatDateTime(entry.created_at)}</p>
                    {entry.after_json ? <p className="mt-0.5 break-words text-[10.5px] text-muted">{entry.after_json}</p> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-muted">No audit entries yet.</p>}
          </section>

          <section className="border border-line bg-surface p-5">
            <h2 className="text-lg">Recent orders</h2>
            {data.recentOrders.length ? (
              <ul className="mt-3 divide-y divide-line text-[12.5px]">
                {data.recentOrders.map((order) => (
                  <li key={order.reference} className="flex justify-between gap-3 py-2.5">
                    <span>{order.reference}<span className="block text-[10.5px] text-muted">{order.order_number} · {formatDate(order.created_at)}</span></span>
                    <span className="flex items-center gap-3">{formatINR(order.total_paise)}<StatusBadge status={order.status} label={sellerOrderStatusLabel(order.status)} /></span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-muted">No orders.</p>}
          </section>
        </div>
        <aside className="space-y-5">
          <section className="border border-line bg-surface p-5">
            <h2 className="text-lg">Ledger</h2>
            <dl className="mt-3 space-y-2 text-[12.5px]">
              <div className="flex justify-between"><dt className="text-muted">Platform Fee</dt><dd>{formatINR(metrics.commission ?? 0)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Eligible</dt><dd>{formatINR(metrics.eligible ?? 0)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Settled</dt><dd>{formatINR(metrics.settled ?? 0)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Platform fee rule</dt><dd>{data.commissionRules ? percentFromBp(data.commissionRules.rate_bp) : 'Default 12%'}</dd></div>
            </dl>
          </section>
          <section className="border border-line bg-surface p-5">
            <h2 className="text-lg">Record adjustment</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">Positive adds to seller balance; negative deducts. Creates an eligible ledger entry with your note.</p>
            <form onSubmit={recordAdjustment} className="mt-3 space-y-3">
              <Field label="Amount" required hint="₹, negative allowed"><Input required inputMode="decimal" value={adjustAmount} onChange={(event) => setAdjustAmount(event.target.value)} /></Field>
              <Field label="Note" required><Textarea rows={2} value={adjustNote} onChange={(event) => setAdjustNote(event.target.value)} /></Field>
              <Button type="submit" size="sm" variant="secondary">Record adjustment</Button>
            </form>
          </section>
          <section className="border border-line bg-paper p-5 text-[11px] leading-relaxed text-muted">
            <p className="font-medium text-ink">Document access</p>
            <p className="mt-1">Files are served through an authenticated admin route and marked private/no-store. Do not download identity documents to personal devices.</p>
          </section>
        </aside>
      </div>

      <Modal
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={decision ? `Seller decision: ${humanise(decision)}` : 'Seller decision'}
        footer={<><Button variant="ghost" onClick={() => setDecision(null)}>Cancel</Button><Button loading={busy} onClick={() => void decide()}>Record decision</Button></>}
      >
        <div className="space-y-4">
          {decision === 'request_changes' ? (
            <Alert tone="info">
              Describe exactly which sections or documents need attention. The seller can edit and resubmit the same
              application, and the revision history is preserved.
            </Alert>
          ) : null}
          {decision === 'request_reverification' ? (
            <Alert tone="info">
              The application returns to review. The seller stays approved and can keep trading while you check fresh
              evidence. Use Suspend instead if trading must stop.
            </Alert>
          ) : null}
          {decision && ['reject', 'request_changes', 'suspend', 'request_reverification'].includes(decision) ? <Alert tone="warning">A reason is required and will be shown to the seller.</Alert> : null}
          <Field
            label="Reason"
            hint={['reject', 'request_changes', 'suspend', 'request_reverification'].includes(decision ?? '') ? 'Required' : 'Optional'}
          >
            <Textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(documentTarget)}
        onClose={() => {
          setDocumentTarget(null);
          setDocumentNote('');
        }}
        title="Reject this document?"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setDocumentTarget(null);
                setDocumentNote('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={documentBusy}
              onClick={() => {
                if (documentNote.trim().length < 3) {
                  toast.push('A rejection note is required so the seller knows what to fix.', 'error');
                  return;
                }
                if (documentTarget) void decideDocument(documentTarget.id, 'rejected', documentNote.trim());
              }}
            >
              Reject document
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Alert tone="warning">
            The seller sees this note next to “{documentTarget?.label ?? 'the document'}” and can upload a replacement.
          </Alert>
          <Field label="Reason for rejection" required hint="At least 3 characters">
            <Textarea rows={3} value={documentNote} onChange={(event) => setDocumentNote(event.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

interface AdminProductRow {
  id: string; name: string; slug: string; status: string; price_paise: number; sku: string; created_at: string;
  submitted_at: string | null; rejection_reason: string | null; moderation_note: string | null; changes_requested_at: string | null;
  seller_name: string; seller_id: string;
  image_url: string | null; stock: number; reserved: number; low_stock_threshold: number;
  is_demo: number; origin_verified: number;
}

function productWorkflowStatus(row: { status: string; changes_requested_at?: string | null }): string {
  if (row.status === 'approved') return 'published';
  if (row.status === 'pending') return row.changes_requested_at ? 'changes_requested' : 'submitted';
  return row.status;
}

function productWorkflowLabel(row: { status: string; changes_requested_at?: string | null }): string {
  return PRODUCT_WORKFLOW_LABELS[productWorkflowStatus(row) as ProductStatus] ?? humanise(row.status);
}

const PRODUCT_STATUS_LABELS: Record<string, string> = {
  pending: 'In review',
  approved: 'Published',
  draft: 'Draft',
  rejected: 'Rejected',
  paused: 'Paused',
  archived: 'Archived',
};

const EMPTY_PRODUCT_FORM = {
  name: '',
  categoryId: '',
  sellerId: '',
  price: '',
  compareAtPrice: '',
  stock: '0',
  lowStockThreshold: '3',
  sku: '',
  status: 'draft' as 'draft' | 'approved',
  shortDescription: '',
  description: '',
  unit: 'piece',
  weightG: '',
  originPlace: '',
  materials: '',
  foodInfo: '',
  isDemo: false,
};

export function AdminProductsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') ?? '';
  const lowStock = searchParams.get('lowStock') === 'true';
  const [q, setQ] = useState('');
  const deferredQ = useDeferredValue(q.trim());
  const [page, setPage] = useState(1);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AdminProductRow | null>(null);
  const [createForm, setCreateForm] = useState({ ...EMPTY_PRODUCT_FORM });

  const products = useQuery({
    queryKey: ['admin-products', status, lowStock, deferredQ, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (status) params.set('status', status);
      if (lowStock) params.set('lowStock', 'true');
      if (deferredQ) params.set('q', deferredQ);
      return api<Paged<AdminProductRow> & { products: AdminProductRow[] }>(`/admin/products?${params.toString()}`);
    },
  });

  const categories = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api<{ categories: { id: string; name: string; is_active: number }[] }>('/admin/categories'),
  });

  const approvedSellers = useQuery({
    queryKey: ['admin-sellers', 'approved', 'product-create'],
    queryFn: () => api<{ sellers: { id: string; business_name: string }[] }>('/admin/sellers?status=approved&pageSize=100'),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
  };

  const setFilter = (next: { status?: string; lowStock?: boolean }) => {
    const params = new URLSearchParams(searchParams);
    if (next.status !== undefined) {
      if (next.status) params.set('status', next.status);
      else params.delete('status');
    }
    if (next.lowStock !== undefined) {
      if (next.lowStock) params.set('lowStock', 'true');
      else params.delete('lowStock');
    }
    setPage(1);
    setSearchParams(params, { replace: true });
  };

  const clearFilters = () => {
    setQ('');
    setPage(1);
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (createForm.name.trim().length < 2) {
      toast.push('Enter a product name of at least 2 characters.', 'error');
      return;
    }
    if (createForm.description.trim().length < 10) {
      toast.push('Write at least 10 characters for the description.', 'error');
      return;
    }
    const priceNum = Number(createForm.price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      toast.push('Price must be zero or greater.', 'error');
      return;
    }
    const compareNum = createForm.compareAtPrice.trim() ? Number(createForm.compareAtPrice) : null;
    if (compareNum !== null && (!Number.isFinite(compareNum) || compareNum < priceNum)) {
      toast.push('Compare-at price must be at least the selling price.', 'error');
      return;
    }
    const stockNum = Number(createForm.stock);
    if (!Number.isInteger(stockNum) || stockNum < 0) {
      toast.push('Stock must be a whole number of zero or more.', 'error');
      return;
    }
    const thresholdNum = Number(createForm.lowStockThreshold);
    if (!Number.isInteger(thresholdNum) || thresholdNum < 0) {
      toast.push('Low-stock threshold must be a whole number of zero or more.', 'error');
      return;
    }
    if (!createForm.sellerId) {
      toast.push('Choose the approved seller this listing belongs to.', 'error');
      return;
    }

    setCreating(true);
    try {
      const created = await api<{ id: string; slug: string }>('/admin/products', {
        method: 'POST',
        body: {
          name: createForm.name.trim(),
          categoryId: createForm.categoryId || undefined,
          sellerId: createForm.sellerId,
          pricePaise: Math.round(priceNum * 100),
          compareAtPricePaise: compareNum === null ? null : Math.round(compareNum * 100),
          stock: stockNum,
          lowStockThreshold: thresholdNum,
          sku: createForm.sku.trim() || undefined,
          status: createForm.status,
          shortDescription: createForm.shortDescription.trim() || undefined,
          description: createForm.description.trim(),
          unit: createForm.unit.trim() || 'piece',
          weightG: createForm.weightG.trim() ? Math.round(Number(createForm.weightG)) : undefined,
          originPlace: createForm.originPlace.trim() || undefined,
          materials: createForm.materials.trim() || undefined,
          foodInfo: createForm.foodInfo.trim() || undefined,
          isDemo: createForm.isDemo,
        },
      });
      toast.push(
        `“${createForm.name.trim()}” created as ${createForm.status === 'approved' ? 'a published listing' : 'a draft'}.`,
      );
      setCreateModalOpen(false);
      setCreateForm({ ...EMPTY_PRODUCT_FORM });
      await refresh();
      navigate(`/admin/products/${created.id}`);
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setCreating(false);
    }
  };

  const publishProduct = async (id: string) => {
    setActionBusyId(id);
    try {
      await api(`/admin/products/${id}/publish`, { method: 'POST' });
      toast.push('Product published to the customer storefront.');
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setActionBusyId(null);
    }
  };

  const unpublishProduct = async (id: string) => {
    setActionBusyId(id);
    try {
      await api(`/admin/products/${id}/unpublish`, { method: 'POST' });
      toast.push('Product unpublished and hidden from the storefront.');
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setActionBusyId(null);
    }
  };

  const archiveProduct = async () => {
    if (!archiveTarget) return;
    setActionBusyId(archiveTarget.id);
    try {
      await api(`/admin/products/${archiveTarget.id}/archive`, { method: 'POST' });
      toast.push('Product archived. Historical orders remain intact.');
      setArchiveTarget(null);
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setActionBusyId(null);
    }
  };

  const activeCategories = categories.data?.categories.filter((category) => category.is_active) ?? [];
  const noApprovedSeller = approvedSellers.data !== undefined && approvedSellers.data.sellers.length === 0;
  const rows = products.data?.products ?? [];
  const filterActive = Boolean(status || lowStock || deferredQ);

  return (
    <AdminPage>
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Catalogue moderation</p>
          <h1 className="mt-2 text-3xl leading-tight">Products</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Moderate seller submissions, inspect stock and publish approved listings. Admin-created listings are assigned to
            an approved seller and recorded in the audit log.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setFilter({ lowStock: !lowStock })}>
            {lowStock ? 'Show all stock' : 'Low stock only'}
          </Button>
          <Button size="sm" onClick={() => setCreateModalOpen(true)} disabled={noApprovedSeller}>
            Add product
          </Button>
        </div>
      </div>

      {noApprovedSeller ? (
        <Alert tone="warning" title="An approved seller is required">
          Products must belong to an approved seller. Approve a seller application before creating a listing from the admin
          console.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Search listings" className="w-full sm:max-w-xs">
          <Input
            type="search"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder="Name, SKU or seller"
          />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(event) => setFilter({ status: event.target.value })} className="max-w-52">
            <option value="">All statuses</option>
            {['pending', 'approved', 'rejected', 'draft', 'paused', 'archived'].map((value) => (
              <option key={value} value={value}>
                {PRODUCT_STATUS_LABELS[value] ?? humanise(value)}
              </option>
            ))}
          </Select>
        </Field>
        {lowStock ? (
          <button
            type="button"
            onClick={() => setFilter({ lowStock: false })}
            className="mb-0.5 inline-flex items-center gap-1.5 border border-harvest/40 bg-[#fbf4e4] px-3 py-2 text-[11px] font-medium text-[#7c5a1c]"
          >
            Low stock only
            <span aria-hidden>×</span>
          </button>
        ) : null}
        <p className="pb-3 text-[11px] text-muted sm:ml-auto">
          {products.data ? `${products.data.total.toLocaleString('en-IN')} listing${products.data.total === 1 ? '' : 's'}` : 'Loading listings…'}
        </p>
      </div>

      <div>
        {products.isLoading ? <LoadingBlock rows={4} /> : null}
        {products.isError ? <ErrorState title="Listings could not load" onRetry={() => void products.refetch()} /> : null}
        {products.data && rows.length ? (
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="min-w-full text-left text-[12.5px]" aria-label="Product listings">
              <thead className="border-b border-line bg-paper text-[9.5px] uppercase tracking-[0.14em] text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Listing</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Seller</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Price</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Available</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Submitted</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((product) => {
                  const available = Number(product.stock ?? 0) - Number(product.reserved ?? 0);
                  const threshold = Number(product.low_stock_threshold ?? 0);
                  return (
                    <tr key={product.id} className="hover:bg-paper/60">
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden border border-line bg-sand/30">
                            {product.image_url ? (
                              <img src={product.image_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-[9px] uppercase tracking-wider text-muted">No photo</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Link to={`/admin/products/${product.id}`} className="font-medium text-forest hover:text-terra">
                                {product.name}
                              </Link>
                              {product.is_demo ? <Badge tone="sand">Demo</Badge> : null}
                            </div>
                            <p className="text-[10.5px] text-muted">
                              {product.sku}
                              {product.origin_verified ? ' · origin verified' : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Link to={`/admin/sellers/${product.seller_id}`} className="text-forest underline underline-offset-2">
                          {product.seller_name}
                        </Link>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={productWorkflowStatus(product)} label={productWorkflowLabel(product)} />
                        {product.moderation_note ? (
                          <p className="mt-1 max-w-[14rem] text-[10.5px] text-terra">{product.moderation_note}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 tabular-nums">{formatINR(product.price_paise)}</td>
                      <td className="px-4 py-4 tabular-nums">
                        {available}
                        {available <= 0 ? (
                          <p className="text-[10px] font-medium text-terra">Out of stock</p>
                        ) : available <= threshold ? (
                          <p className="text-[10px] font-medium text-[#7c5a1c]">At or below {threshold}</p>
                        ) : null}
                        {Number(product.reserved ?? 0) > 0 ? (
                          <p className="text-[10px] text-muted">{product.reserved} reserved</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-muted">{product.submitted_at ? formatDate(product.submitted_at) : '—'}</td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Link
                            to={`/admin/products/${product.id}`}
                            className="inline-block px-2 py-1 text-[11px] text-forest underline underline-offset-2 hover:text-terra"
                          >
                            Open
                          </Link>
                          {product.status !== 'approved' && product.status !== 'archived' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={actionBusyId === product.id}
                              onClick={() => void publishProduct(product.id)}
                            >
                              Publish
                            </Button>
                          ) : null}
                          {product.status === 'approved' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={actionBusyId === product.id}
                              onClick={() => void unpublishProduct(product.id)}
                            >
                              Unpublish
                            </Button>
                          ) : null}
                          {product.status !== 'archived' ? (
                            <Button size="sm" variant="ghost" disabled={actionBusyId === product.id} onClick={() => setArchiveTarget(product)}>
                              Archive
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {products.data && !rows.length ? (
          <EmptyState
            eyebrow={lowStock ? 'Stock healthy' : undefined}
            title={lowStock ? 'No low-stock listings' : 'No listings in this view'}
            body={
              lowStock
                ? 'Every published listing is above its configured low-stock threshold.'
                : 'Try a different status, clear the search, or wait for a seller to submit a listing.'
            }
            action={
              filterActive ? (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null
            }
          />
        ) : null}
        {products.data ? <Pagination page={page} totalPages={products.data.totalPages} onChange={setPage} /> : null}
      </div>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive this product?"
        confirmLabel="Archive product"
        loading={actionBusyId === archiveTarget?.id}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => void archiveProduct()}
      >
        {archiveTarget ? (
          <>
            “{archiveTarget.name}” will be removed from the public storefront. Existing orders, payments and reviews stay
            intact, and the listing can be restored from the product record.
          </>
        ) : null}
      </ConfirmDialog>

      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Add a product"
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button loading={creating} onClick={(event) => void submitCreate(event)}>
              Create product
            </Button>
          </>
        }
      >
        <form onSubmit={submitCreate} className="space-y-4 text-left">
          <Alert tone="info">
            This creates a marketplace listing directly. Assign a real approved seller and category. Leave the demo flag off
            for live trade; demo orders never count toward GMV.
          </Alert>

          <Field label="Product name" required>
            <Input
              value={createForm.name}
              onChange={(event) => setCreateForm((previous) => ({ ...previous, name: event.target.value }))}
              placeholder="e.g. Kangra Orthodox Green Tea"
              required
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Seller" required hint="Approved sellers only">
              <Select
                value={createForm.sellerId}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, sellerId: event.target.value }))}
                required
              >
                <option value="">Choose a seller</option>
                {approvedSellers.data?.sellers.map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.business_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category" hint="Defaults to the first active category">
              <Select
                value={createForm.categoryId}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, categoryId: event.target.value }))}
              >
                <option value="">First active category</option>
                {activeCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Price (₹)" required>
              <Input
                type="number"
                min="0"
                step="1"
                value={createForm.price}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, price: event.target.value }))}
                required
              />
            </Field>
            <Field label="Compare-at price (₹)" hint="Optional">
              <Input
                type="number"
                min="0"
                step="1"
                value={createForm.compareAtPrice}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, compareAtPrice: event.target.value }))}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Initial stock" required>
              <Input
                type="number"
                min="0"
                step="1"
                value={createForm.stock}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, stock: event.target.value }))}
                required
              />
            </Field>
            <Field label="Low-stock threshold" required hint="Units">
              <Input
                type="number"
                min="0"
                step="1"
                value={createForm.lowStockThreshold}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, lowStockThreshold: event.target.value }))}
                required
              />
            </Field>
            <Field label="SKU" hint="Optional">
              <Input
                value={createForm.sku}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, sku: event.target.value }))}
                placeholder="KGT-001"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Unit">
              <Input
                value={createForm.unit}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, unit: event.target.value }))}
                placeholder="piece, 250 g"
              />
            </Field>
            <Field label="Weight (g)" hint="Optional">
              <Input
                type="number"
                min="0"
                step="1"
                value={createForm.weightG}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, weightG: event.target.value }))}
              />
            </Field>
            <Field label="Origin place" hint="Optional">
              <Input
                value={createForm.originPlace}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, originPlace: event.target.value }))}
                placeholder="Kangra, Himachal Pradesh"
              />
            </Field>
          </div>

          <Field label="Short description" hint="Maximum 300 characters">
            <Input
              value={createForm.shortDescription}
              maxLength={300}
              onChange={(event) => setCreateForm((previous) => ({ ...previous, shortDescription: event.target.value }))}
            />
          </Field>

          <Field label="Full description" required hint="At least 10 characters">
            <Textarea
              rows={4}
              value={createForm.description}
              onChange={(event) => setCreateForm((previous) => ({ ...previous, description: event.target.value }))}
              required
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Materials / ingredients" hint="Optional">
              <Textarea
                rows={2}
                value={createForm.materials}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, materials: event.target.value }))}
              />
            </Field>
            <Field label="Food / nutritional information" hint="Required in practice for food">
              <Textarea
                rows={2}
                value={createForm.foodInfo}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, foodInfo: event.target.value }))}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Initial status">
              <Select
                value={createForm.status}
                onChange={(event) =>
                  setCreateForm((previous) => ({ ...previous, status: event.target.value as 'draft' | 'approved' }))
                }
              >
                <option value="draft">Draft — private</option>
                <option value="approved">Published — visible in storefront</option>
              </Select>
            </Field>
            <label className="flex items-start gap-2 border border-line bg-paper p-3 text-[11px] leading-relaxed text-muted">
              <input
                type="checkbox"
                checked={createForm.isDemo}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, isDemo: event.target.checked }))}
                className="mt-0.5 accent-forest"
              />
              <span>
                <span className="block font-medium text-ink">Demo / test record</span>
                Clearly labelled test products are excluded from real GMV reporting. Leave off for live trade.
              </span>
            </label>
          </div>

          <button type="submit" className="hidden" aria-hidden />
        </form>
      </Modal>
    </AdminPage>
  );
}

interface AdminProductDetail {
  product: Record<string, unknown> & {
    id: string;
    name: string;
    status: string;
    description: string;
    seller_id: string;
    seller_name: string;
    seller_status: string;
    category_id: string;
    category_name: string | null;
    stock: number;
    reserved: number;
    low_stock_threshold: number;
    images: { id: string; url: string; alt: string; credit: string | null }[];
  };
}

function complianceSummary(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.entries(parsed)
      .filter(([, item]) => typeof item === 'string' && item.trim())
      .map(([key, item]) => `${humanise(key)}: ${String(item)}`)
      .join(' · ');
  } catch {
    return '';
  }
}

export function AdminProductDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [originVerified, setOriginVerified] = useState(false);
  const [taxPercent, setTaxPercent] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; alt: string } | null>(null);
  const [deletingImage, setDeletingImage] = useState(false);

  const [stockQty, setStockQty] = useState('');
  const [stockMode, setStockMode] = useState<'set' | 'adjust'>('set');
  const [stockThreshold, setStockThreshold] = useState('');
  const [stockBusy, setStockBusy] = useState(false);

  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    categoryId: '',
    price: '',
    compareAtPrice: '',
    sku: '',
    unit: '',
    weightG: '',
    shortDescription: '',
    description: '',
    originPlace: '',
    materials: '',
    foodInfo: '',
    isDemo: false,
    originVerified: false,
  });

  const detail = useQuery({
    queryKey: ['admin-product', id],
    queryFn: () => api<AdminProductDetail>(`/admin/products/${id}`),
    enabled: Boolean(id),
  });
  const categories = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api<{ categories: { id: string; name: string; is_active: number }[] }>('/admin/categories'),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-product', id] });
    await queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
  };

  const product = detail.data?.product;

  const openEditModal = () => {
    if (!product) return;
    setEditForm({
      name: String(product.name ?? ''),
      categoryId: String(product.category_id ?? ''),
      price: String((Number(product.price_paise ?? 0) / 100).toFixed(0)),
      compareAtPrice: product.compare_at_price_paise ? String((Number(product.compare_at_price_paise) / 100).toFixed(0)) : '',
      sku: String(product.sku ?? ''),
      unit: String(product.unit ?? 'piece'),
      weightG: product.weight_g ? String(product.weight_g) : '',
      shortDescription: String(product.short_description ?? ''),
      description: String(product.description ?? ''),
      originPlace: String(product.origin_place ?? ''),
      materials: String(product.materials ?? ''),
      foodInfo: String(product.food_info ?? ''),
      isDemo: Boolean(product.is_demo),
      originVerified: Boolean(product.origin_verified),
    });
    setEditOpen(true);
  };

  const saveProductEdits = async (event: FormEvent) => {
    event.preventDefault();
    if (editForm.name.trim().length < 2) {
      toast.push('Product name must be at least 2 characters.', 'error');
      return;
    }
    if (editForm.description.trim().length < 10) {
      toast.push('Write at least 10 characters for the description.', 'error');
      return;
    }
    const priceNum = Number(editForm.price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      toast.push('Price must be a valid non-negative number.', 'error');
      return;
    }
    const compareNum = editForm.compareAtPrice.trim() ? Number(editForm.compareAtPrice) : null;
    if (compareNum !== null && (!Number.isFinite(compareNum) || compareNum < priceNum)) {
      toast.push('Compare-at price must be at least the selling price.', 'error');
      return;
    }
    const weightNum = editForm.weightG.trim() ? Number(editForm.weightG) : null;
    if (weightNum !== null && (!Number.isFinite(weightNum) || weightNum < 0)) {
      toast.push('Weight must be a non-negative number of grams.', 'error');
      return;
    }

    setEditing(true);
    try {
      await api(`/admin/products/${id}`, {
        method: 'PATCH',
        body: {
          name: editForm.name.trim(),
          categoryId: editForm.categoryId || undefined,
          pricePaise: Math.round(priceNum * 100),
          compareAtPricePaise: compareNum === null ? null : Math.round(compareNum * 100),
          sku: editForm.sku.trim() || undefined,
          unit: editForm.unit.trim() || 'piece',
          weightG: weightNum === null ? null : Math.round(weightNum),
          shortDescription: editForm.shortDescription.trim() || undefined,
          description: editForm.description.trim(),
          originPlace: editForm.originPlace.trim() || null,
          materials: editForm.materials.trim() || null,
          foodInfo: editForm.foodInfo.trim() || null,
          isDemo: editForm.isDemo,
          originVerified: editForm.originVerified,
        },
      });
      toast.push('Product details saved.');
      setEditOpen(false);
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setEditing(false);
    }
  };

  const submitStock = async (event: FormEvent) => {
    event.preventDefault();
    const qty = Number(stockQty);
    if (!Number.isInteger(qty) || (stockMode === 'set' && qty < 0)) {
      toast.push('Enter a whole, non-negative stock quantity.', 'error');
      return;
    }
    const threshold = stockThreshold.trim() ? Number(stockThreshold) : undefined;
    if (threshold !== undefined && (!Number.isInteger(threshold) || threshold < 0)) {
      toast.push('Low-stock threshold must be a whole number of zero or more.', 'error');
      return;
    }
    setStockBusy(true);
    try {
      await api(`/admin/products/${id}/stock`, {
        method: 'POST',
        body: {
          quantity: qty,
          mode: stockMode,
          lowStockThreshold: threshold,
          reason: 'admin_panel_update',
        },
      });
      toast.push('Inventory updated and recorded in the audit log.');
      setStockQty('');
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setStockBusy(false);
    }
  };

  const publishProduct = async () => {
    setActionBusy(true);
    try {
      await api(`/admin/products/${id}/publish`, { method: 'POST' });
      toast.push('Product published to the customer storefront.');
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const unpublishProduct = async () => {
    setActionBusy(true);
    try {
      await api(`/admin/products/${id}/unpublish`, { method: 'POST' });
      toast.push('Product unpublished and hidden from the storefront.');
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const archiveProduct = async () => {
    setActionBusy(true);
    try {
      await api(`/admin/products/${id}/archive`, { method: 'POST' });
      toast.push('Product archived. Historical orders remain intact.');
      setConfirmArchive(false);
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const uploadImage = async () => {
    if (!selectedImageFile) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selectedImageFile.type)) {
      toast.push('Choose a JPEG, PNG or WebP image.', 'error');
      return;
    }
    if (selectedImageFile.size > 5 * 1024 * 1024) {
      toast.push('Images must be 5 MB or smaller.', 'error');
      return;
    }
    setImageBusy(true);
    const formData = new FormData();
    formData.append('image', selectedImageFile);
    formData.append('alt', `${product?.name ?? 'Product'} photo`);
    try {
      await api(`/admin/products/${id}/images`, { method: 'POST', body: formData });
      toast.push('Photograph uploaded.');
      setSelectedImageFile(null);
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setImageBusy(false);
    }
  };

  const deleteImage = async () => {
    if (!deleteTarget) return;
    setDeletingImage(true);
    try {
      await api(`/admin/products/${id}/images/${deleteTarget.id}`, { method: 'DELETE' });
      toast.push('Photograph removed.');
      setDeleteTarget(null);
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setDeletingImage(false);
    }
  };

  const decide = async () => {
    if (!decision) return;
    if (decision !== 'approve' && reason.trim().length < 10) {
      toast.push('Give the seller a clear reason (at least 10 characters).', 'error');
      return;
    }
    let taxRateBp: number | undefined;
    if (decision === 'approve' && taxPercent.trim()) {
      const percent = Number(taxPercent);
      if (!Number.isFinite(percent) || percent < 0 || percent > 50) {
        toast.push('GST rate must be between 0 and 50 percent.', 'error');
        return;
      }
      taxRateBp = Math.round(percent * 100);
    }
    setBusy(true);
    try {
      await api(`/admin/products/${id}/decision`, {
        method: 'POST',
        body: {
          decision,
          reason: reason.trim() || undefined,
          originVerified: decision === 'approve' ? originVerified : undefined,
          taxRateBp,
        },
      });
      toast.push(`Listing decision recorded: ${humanise(decision)}.`);
      setDecision(null);
      setReason('');
      setTaxPercent('');
      setOriginVerified(false);
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleFeatured = async () => {
    try {
      await api(`/admin/products/${id}/feature`, {
        method: 'POST',
        body: { featured: !detail.data?.product.is_featured },
      });
      await refresh();
      toast.push(detail.data?.product.is_featured ? 'Removed from featured listings.' : 'Featured on the storefront.');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    }
  };

  if (detail.isLoading) return <LoadingBlock rows={4} />;
  if (detail.isError || !detail.data || !product)
    return <ErrorState title="Listing not found" onRetry={() => void detail.refetch()} />;

  const workflow = { status: String(product.status), changes_requested_at: product.changes_requested_at as string | null };
  const available = Number(product.stock ?? 0) - Number(product.reserved ?? 0);
  const threshold = Number(product.low_stock_threshold ?? 0);
  const isPending = String(product.status) === 'pending';
  const isApproved = String(product.status) === 'approved';
  const isArchived = String(product.status) === 'archived';
  const compliance = complianceSummary(product.compliance_json);

  return (
    <AdminPage>
      <nav aria-label="Breadcrumb" className="text-[11px] text-muted">
        <Link to="/admin/products" className="hover:text-forest">
          Products
        </Link>
        <span aria-hidden className="px-1.5">/</span>
        <span className="text-ink">{String(product.name)}</span>
      </nav>

      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Listing moderation & management</p>
          <h1 className="mt-2 break-words text-3xl leading-tight">{String(product.name)}</h1>
          <p className="mt-2 text-sm text-muted">
            {String(product.seller_name)} · {String(product.sku)} · {formatINR(Number(product.price_paise ?? 0))}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={productWorkflowStatus(workflow)} label={productWorkflowLabel(workflow)} />
            {product.is_demo ? <Badge tone="sand">Demo record</Badge> : null}
            {product.is_featured ? <Badge tone="forest">Featured</Badge> : null}
            {product.origin_verified ? <Badge tone="forest">Origin verified</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={openEditModal}>
            Edit details
          </Button>
          {!isApproved && !isArchived ? (
            <Button size="sm" loading={actionBusy} onClick={() => void publishProduct()}>
              Publish to storefront
            </Button>
          ) : null}
          {isApproved ? (
            <Button size="sm" variant="secondary" loading={actionBusy} onClick={() => void unpublishProduct()}>
              Unpublish
            </Button>
          ) : null}
          {!isArchived ? (
            <Button size="sm" variant="danger" loading={actionBusy} onClick={() => setConfirmArchive(true)}>
              Archive
            </Button>
          ) : null}
        </div>
      </div>

      {isPending ? (
        <div className="flex flex-wrap items-center gap-2 border border-harvest/40 bg-[#fbf4e4] px-4 py-3">
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-[#5f4514]">
            This listing is waiting for a moderation decision. The seller cannot edit it until a decision is recorded.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setDecision('approve')}>
              Approve listing
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDecision('request_changes')}>
              Request changes
            </Button>
            <Button size="sm" variant="danger" onClick={() => setDecision('reject')}>
              Reject
            </Button>
          </div>
        </div>
      ) : null}

      {product.rejection_reason ? (
        <Alert tone="warning" title="Reviewer note sent to the seller">
          {String(product.rejection_reason)}
        </Alert>
      ) : null}
      {product.moderation_note && product.moderation_note !== product.rejection_reason ? (
        <Alert tone="info" title="Changes requested">
          {String(product.moderation_note)}
        </Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <AdminSection
            title="Listing information"
            description="Customer-facing copy and commerce fields. Changes are applied to the live listing immediately."
            action={
              <Button size="sm" variant="ghost" onClick={openEditModal}>
                Edit
              </Button>
            }
          >
            <dl className="grid gap-x-6 gap-y-4 text-[12.5px] sm:grid-cols-2">
              <div>
                <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Category</dt>
                <dd className="mt-0.5">{product.category_name ? String(product.category_name) : 'Uncategorised'}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Unit</dt>
                <dd className="mt-0.5">{text(product.unit)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Price</dt>
                <dd className="mt-0.5 tabular-nums">{formatINR(Number(product.price_paise ?? 0))}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Compare-at</dt>
                <dd className="mt-0.5 tabular-nums">
                  {product.compare_at_price_paise ? formatINR(Number(product.compare_at_price_paise)) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Weight</dt>
                <dd className="mt-0.5">{product.weight_g ? `${numberText(product.weight_g)} g` : '—'}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">GST rate</dt>
                <dd className="mt-0.5 tabular-nums">{percentFromBp(Number(product.tax_rate_bp ?? 0))}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Origin</dt>
                <dd className="mt-0.5">
                  {text(product.origin_place)}
                  <span className={`ml-1.5 text-[10px] ${product.origin_verified ? 'text-sage' : 'text-muted'}`}>
                    {product.origin_verified ? '· verified' : '· not verified'}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Demo record</dt>
                <dd className="mt-0.5">{product.is_demo ? 'Yes — excluded from GMV' : 'No — live listing'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Short description</dt>
                <dd className="mt-0.5">{text(product.short_description)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Description</dt>
                <dd className="mt-0.5 whitespace-pre-wrap leading-relaxed">{String(product.description)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Materials</dt>
                <dd className="mt-0.5">{text(product.materials)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Food information</dt>
                <dd className="mt-0.5">{text(product.food_info)}</dd>
              </div>
              {compliance ? (
                <div className="sm:col-span-2">
                  <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Food compliance</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap">{compliance}</dd>
                </div>
              ) : null}
            </dl>
          </AdminSection>

          <AdminSection
            title={`Photographs (${product.images.length}/8)`}
            description="Uploaded images are served from the configured storage path. Alt text is required for accessibility."
            bodyClassName="p-5"
          >
            {product.images.length ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {product.images.map((image) => (
                  <figure key={image.id} className="border border-line bg-paper">
                    <img src={image.url} alt={image.alt} className="aspect-square w-full object-cover" />
                    <figcaption className="p-2.5 text-[10.5px] text-muted">
                      <p className="truncate text-ink">{image.alt}</p>
                      {image.credit ? <p className="truncate">{image.credit}</p> : null}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ id: image.id, alt: image.alt })}
                        className="mt-1 text-terra underline underline-offset-2 hover:opacity-80"
                      >
                        Delete photo
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No photographs uploaded. A listing without a photo is unlikely to be approved.</p>
            )}

            <div className="mt-4 border-t border-line pt-4">
              <label htmlFor="admin-product-image" className="block text-[11.5px] font-medium text-ink">
                Upload photograph
              </label>
              <p className="mt-0.5 text-[10.5px] text-muted">JPEG, PNG or WebP · maximum 5 MB · up to 8 images.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  id="admin-product-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setSelectedImageFile(event.target.files?.[0] ?? null)}
                  className="text-xs file:mr-2 file:border file:border-line file:bg-surface file:px-2.5 file:py-1 file:text-xs hover:file:bg-paper"
                />
                <Button
                  size="sm"
                  disabled={!selectedImageFile || product.images.length >= 8}
                  loading={imageBusy}
                  onClick={() => void uploadImage()}
                >
                  Upload
                </Button>
              </div>
            </div>
          </AdminSection>
        </div>

        <aside className="space-y-5">
          <AdminSection
            title="Inventory"
            description="Stock updates are atomic and recorded with the administrator identity."
            bodyClassName="p-5"
          >
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="border border-line bg-paper p-2">
                <p className="text-[10px] uppercase tracking-[0.1em] text-muted">On hand</p>
                <p className="mt-1 font-serif text-lg text-ink">{numberText(product.stock)}</p>
              </div>
              <div className="border border-line bg-paper p-2">
                <p className="text-[10px] uppercase tracking-[0.1em] text-muted">Reserved</p>
                <p className="mt-1 font-serif text-lg text-ink">{numberText(product.reserved)}</p>
              </div>
              <div className="border border-line bg-paper p-2">
                <p className="text-[10px] uppercase tracking-[0.1em] text-muted">Available</p>
                <p className={`mt-1 font-serif text-lg ${available <= 0 ? 'text-terra' : 'text-forest'}`}>{available}</p>
              </div>
            </div>

            <p
              className={`mt-3 border px-3 py-2 text-[10.5px] leading-relaxed ${
                available <= 0
                  ? 'border-terra/25 bg-terra/[0.06] text-[#8e4630]'
                  : available <= threshold
                    ? 'border-harvest/40 bg-[#fbf4e4] text-[#7c5a1c]'
                    : 'border-sage/30 bg-sage/[0.06] text-muted'
              }`}
            >
              {available <= 0
                ? 'Out of stock. The listing is hidden from the storefront until stock is available.'
                : available <= threshold
                  ? `At or below the low-stock threshold of ${threshold}. Restock before it sells out.`
                  : `Above the low-stock threshold of ${threshold}.`}
            </p>

            <form onSubmit={submitStock} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Quantity" required>
                  <Input
                    type="number"
                    step="1"
                    value={stockQty}
                    onChange={(event) => setStockQty(event.target.value)}
                    placeholder="e.g. 50"
                    required
                  />
                </Field>
                <Field label="Mode">
                  <Select value={stockMode} onChange={(event) => setStockMode(event.target.value as 'set' | 'adjust')}>
                    <option value="set">Set total stock</option>
                    <option value="adjust">Add / remove (+/-)</option>
                  </Select>
                </Field>
              </div>
              <Field label="Low-stock threshold" hint={`Currently ${threshold} units`}>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={stockThreshold}
                  onChange={(event) => setStockThreshold(event.target.value)}
                  placeholder={String(threshold)}
                />
              </Field>
              <Button size="sm" type="submit" loading={stockBusy}>
                Update inventory
              </Button>
              <p className="text-[10.5px] leading-relaxed text-muted">
                Stock cannot be set below the reserved quantity. Cancel or complete pending orders first.
              </p>
            </form>
          </AdminSection>

          <AdminSection title="Seller" bodyClassName="p-5">
            <Link to={`/admin/sellers/${product.seller_id}`} className="font-serif text-xl text-forest hover:text-terra">
              {String(product.seller_name)}
            </Link>
            <p className="mt-1 text-[11px] text-muted">
              Store status: {STORE_STATUS_LABELS[String(product.seller_status)] ?? humanise(String(product.seller_status))}
            </p>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              A listing cannot be sold if the seller is suspended. Approval requires an approved seller even when this route
              accepts a moderation decision.
            </p>
          </AdminSection>

          <AdminSection title="Moderation history" bodyClassName="p-5">
            <dl className="space-y-2 text-[11.5px]">
              {[
                ['Submitted', product.submitted_at],
                ['Approved', product.approved_at],
                ['Published', product.published_at],
                ['Changes requested', product.changes_requested_at],
                ['Last updated', product.updated_at],
                ['Created', product.created_at],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-start justify-between gap-3">
                  <dt className="text-muted">{String(label)}</dt>
                  <dd className="text-right text-ink">{value ? formatDateTime(String(value)) : '—'}</dd>
                </div>
              ))}
            </dl>
          </AdminSection>

          <AdminSection title="Storefront visibility" bodyClassName="p-5">
            <p className="text-[11.5px] leading-relaxed text-muted">
              Listings appear to customers only when the listing is approved, the seller is approved and the store is active,
              and available stock is greater than zero. Drafts, archived listings and rejected submissions stay private.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <LinkButton to={`/shop/${text(product.slug)}`} variant="secondary" size="sm">
                View public page
              </LinkButton>
              {isApproved ? (
                <Button size="sm" variant="ghost" onClick={() => void toggleFeatured()}>
                  {product.is_featured ? 'Remove from featured' : 'Feature listing'}
                </Button>
              ) : null}
            </div>
          </AdminSection>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmArchive}
        title="Archive this listing?"
        confirmLabel="Archive product"
        loading={actionBusy}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => void archiveProduct()}
      >
        “{String(product.name)}” will be removed from the public storefront. Existing orders, payments and reviews stay intact.
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this photograph?"
        confirmLabel="Delete photo"
        loading={deletingImage}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteImage()}
      >
        {deleteTarget ? `The image “${deleteTarget.alt}” will be removed from this listing and from the uploads directory.` : null}
      </ConfirmDialog>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit product details"
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button loading={editing} onClick={(event) => void saveProductEdits(event)}>
              Save changes
            </Button>
          </>
        }
      >
        <form onSubmit={saveProductEdits} className="space-y-4 text-left">
          <Field label="Product name" required>
            <Input
              value={editForm.name}
              onChange={(event) => setEditForm((previous) => ({ ...previous, name: event.target.value }))}
              required
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category">
              <Select
                value={editForm.categoryId}
                onChange={(event) => setEditForm((previous) => ({ ...previous, categoryId: event.target.value }))}
              >
                <option value="">Choose a category</option>
                {categories.data?.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                    {category.is_active ? '' : ' (inactive)'}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="SKU" hint="Letters, numbers, dot, dash and underscore">
              <Input
                value={editForm.sku}
                onChange={(event) => setEditForm((previous) => ({ ...previous, sku: event.target.value }))}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Price (₹)" required>
              <Input
                type="number"
                min="0"
                step="1"
                value={editForm.price}
                onChange={(event) => setEditForm((previous) => ({ ...previous, price: event.target.value }))}
                required
              />
            </Field>
            <Field label="Compare-at price (₹)" hint="Optional">
              <Input
                type="number"
                min="0"
                step="1"
                value={editForm.compareAtPrice}
                onChange={(event) => setEditForm((previous) => ({ ...previous, compareAtPrice: event.target.value }))}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Unit">
              <Input
                value={editForm.unit}
                onChange={(event) => setEditForm((previous) => ({ ...previous, unit: event.target.value }))}
                placeholder="piece, 250 g"
              />
            </Field>
            <Field label="Weight (g)" hint="Optional">
              <Input
                type="number"
                min="0"
                step="1"
                value={editForm.weightG}
                onChange={(event) => setEditForm((previous) => ({ ...previous, weightG: event.target.value }))}
              />
            </Field>
          </div>

          <Field label="Short description" hint="Maximum 300 characters">
            <Input
              value={editForm.shortDescription}
              maxLength={300}
              onChange={(event) => setEditForm((previous) => ({ ...previous, shortDescription: event.target.value }))}
            />
          </Field>

          <Field label="Full description" required hint="At least 10 characters">
            <Textarea
              rows={4}
              value={editForm.description}
              onChange={(event) => setEditForm((previous) => ({ ...previous, description: event.target.value }))}
              required
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Origin place">
              <Input
                value={editForm.originPlace}
                onChange={(event) => setEditForm((previous) => ({ ...previous, originPlace: event.target.value }))}
                placeholder="e.g. Kangra, Himachal Pradesh"
              />
            </Field>
            <Field label="Materials / ingredients">
              <Input
                value={editForm.materials}
                onChange={(event) => setEditForm((previous) => ({ ...previous, materials: event.target.value }))}
              />
            </Field>
          </div>

          <Field label="Food / nutritional information">
            <Textarea
              rows={2}
              value={editForm.foodInfo}
              onChange={(event) => setEditForm((previous) => ({ ...previous, foodInfo: event.target.value }))}
            />
          </Field>

          <div className="space-y-2 border border-line bg-paper p-3 text-[11.5px]">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={editForm.isDemo}
                onChange={(event) => setEditForm((previous) => ({ ...previous, isDemo: event.target.checked }))}
                className="mt-0.5 accent-forest"
              />
              <span>
                <span className="block font-medium text-ink">Demo / test record</span>
                <span className="text-muted">Excluded from real GMV and order reporting. Leave off for live trade.</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={editForm.originVerified}
                onChange={(event) => setEditForm((previous) => ({ ...previous, originVerified: event.target.checked }))}
                className="mt-0.5 accent-forest"
              />
              <span>
                <span className="block font-medium text-ink">Origin verified</span>
                <span className="text-muted">Enable only when supporting evidence is on file.</span>
              </span>
            </label>
          </div>
          <button type="submit" className="hidden" aria-hidden />
        </form>
      </Modal>

      <Modal
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={decision ? `Listing decision: ${humanise(decision)}` : 'Listing decision'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDecision(null)}>
              Cancel
            </Button>
            <Button
              variant={decision === 'reject' ? 'danger' : 'primary'}
              loading={busy}
              onClick={() => void decide()}
            >
              Record decision
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {decision === 'approve' ? (
            <>
              <Alert tone="info">
                Only mark origin verified if evidence is recorded. The tax rate defaults to 0% until confirmed by an
                accountant.
              </Alert>
              <label className="flex items-start gap-2 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={originVerified}
                  onChange={(event) => setOriginVerified(event.target.checked)}
                  className="mt-0.5 accent-forest"
                />
                Origin evidence reviewed and on file
              </label>
              <Field label="GST rate" hint="Percent, optional">
                <Input
                  inputMode="decimal"
                  value={taxPercent}
                  onChange={(event) => setTaxPercent(event.target.value)}
                  placeholder="e.g. 5"
                />
              </Field>
            </>
          ) : (
            <Alert tone="warning">A reason of at least 10 characters is required and is shown to the seller.</Alert>
          )}
          {decision !== 'approve' ? (
            <Field label="Reason for the seller" required>
              <Textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
          ) : null}
        </div>
      </Modal>
    </AdminPage>
  );
}

interface AdminOrderRow {
  orderNumber: string; email: string; status: string; totalPaise: number; placedAt: string; paidAt: string | null;
  customerName: string; destination: string; sellerStatuses: string[]; refundCount: number; isDemo?: boolean;
}

interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: number;
  product_count: number;
  active_product_count: number;
  child_count: number;
}

interface CategoryForm {
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  parentId: string;
  sortOrder: number;
  isActive: boolean;
}

const EMPTY_CATEGORY_FORM: CategoryForm = {
  name: '',
  slug: '',
  description: '',
  imageUrl: '',
  parentId: '',
  sortOrder: 0,
  isActive: true,
};

function slugifyCategory(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function AdminCategoriesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const categories = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api<{ categories: AdminCategory[] }>('/admin/categories'),
  });
  const [form, setForm] = useState<CategoryForm>(EMPTY_CATEGORY_FORM);
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const all = categories.data?.categories ?? [];
  const parents = all.filter((category) => !editing || category.id !== editing.id);

  function resetForm() {
    setEditing(null);
    setForm(EMPTY_CATEGORY_FORM);
    setError('');
  }

  function editCategory(category: AdminCategory) {
    setEditing(category);
    setError('');
    setForm({
      name: category.name,
      slug: category.slug,
      description: category.description ?? '',
      imageUrl: category.image_url ?? '',
      parentId: category.parent_id ?? '',
      sortOrder: category.sort_order,
      isActive: category.is_active === 1,
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        name: form.name,
        slug: form.slug,
        description: form.description,
        imageUrl: form.imageUrl,
        parentId: form.parentId || null,
        sortOrder: form.sortOrder,
        isActive: form.isActive,
      };
      if (editing) {
        await api(`/admin/categories/${editing.id}`, { method: 'PATCH', body });
        toast.push('Category updated.');
      } else {
        await api('/admin/categories', { method: 'POST', body });
        toast.push('Category created.');
      }
      await queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
      resetForm();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  if (categories.isLoading) return <LoadingBlock rows={4} />;
  if (categories.isError || !categories.data) return <ErrorState onRetry={() => void categories.refetch()} />;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Catalogue structure"
        title="Categories"
        lede="The shop's navigation and seller listing options. Deactivate only after moving or archiving products; categories are never deleted because order history references them."
        actions={editing ? <Button type="button" variant="secondary" size="sm" onClick={resetForm}>New category</Button> : undefined}
      />
      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <form onSubmit={(event) => void save(event)} className="self-start border border-line bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl">{editing ? 'Edit category' : 'Add a category'}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                New categories are immediately available to sellers when active.
              </p>
            </div>
            {editing ? <Badge tone="terra">Editing</Badge> : null}
          </div>
          <div className="mt-4 space-y-3">
            <Field label="Name" required htmlFor="category-name">
              <Input
                id="category-name"
                value={form.name}
                required
                maxLength={80}
                onChange={(event) => {
                  const name = event.target.value;
                  setForm((current) => {
                    const wasAuto = current.slug === slugifyCategory(current.name);
                    return { ...current, name, slug: wasAuto ? slugifyCategory(name) : current.slug };
                  });
                }}
              />
            </Field>
            <Field label="Slug" required hint="Lowercase letters, numbers and hyphens." htmlFor="category-slug">
              <Input
                id="category-slug"
                value={form.slug}
                required
                maxLength={80}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                onChange={(event) => setForm((current) => ({ ...current, slug: slugifyCategory(event.target.value) }))}
              />
            </Field>
            <Field label="Parent category" hint="Optional. Leave blank for a top-level category." htmlFor="category-parent">
              <Select
                id="category-parent"
                value={form.parentId}
                onChange={(event) => setForm((current) => ({ ...current, parentId: event.target.value }))}
              >
                <option value="">No parent</option>
                {parents.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Description" hint="Shown on the shop category card." htmlFor="category-description">
              <Textarea
                id="category-description"
                rows={3}
                maxLength={500}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              />
            </Field>
            <Field label="Image URL" hint="An https:// URL or a path such as /images/example.jpg." htmlFor="category-image">
              <Input
                id="category-image"
                value={form.imageUrl}
                maxLength={500}
                onChange={(event) => setForm((current) => ({ ...current, imageUrl: event.target.value }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sort order" hint="Lower numbers appear first." htmlFor="category-sort">
                <Input
                  id="category-sort"
                  type="number"
                  min={0}
                  max={10000}
                  value={form.sortOrder}
                  onChange={(event) => setForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))}
                />
              </Field>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                />
                Active in the shop
              </label>
            </div>
            {error ? <Alert tone="error">{error}</Alert> : null}
            <div className="flex gap-2 pt-1">
              <Button type="submit" loading={saving}>{editing ? 'Save changes' : 'Create category'}</Button>
              {editing ? <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button> : null}
            </div>
          </div>
        </form>
        <section className="border border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-xl">Taxonomy</h2>
            <p className="mt-1 text-xs text-muted">{all.length} categories · {all.reduce((sum, category) => sum + category.active_product_count, 0)} live listings</p>
          </div>
          {all.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[12.5px]">
                <thead className="bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
                  <tr>
                    <th className="px-4 py-2.5">Category</th>
                    <th className="px-4 py-2.5">Products</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {all.map((category) => (
                    <tr key={category.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {category.image_url ? (
                            <img src={category.image_url} alt="" className="h-9 w-9 border border-line object-cover" />
                          ) : (
                            <span className="flex h-9 w-9 items-center justify-center border border-line bg-paper text-[10px] text-muted">—</span>
                          )}
                          <div>
                            <p className="font-medium text-ink">{category.name}</p>
                            <p className="text-[10.5px] text-muted">
                              /{category.slug}
                              {category.parent_id ? ` · under ${all.find((item) => item.id === category.parent_id)?.name ?? 'parent'}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {category.active_product_count} live / {category.product_count} total
                        {category.child_count ? <span className="block text-[10.5px]">{category.child_count} subcategories</span> : null}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={category.is_active ? 'forest' : 'neutral'}>{category.is_active ? 'Active' : 'Inactive'}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button type="button" size="sm" variant="ghost" onClick={() => editCategory(category)}>Edit</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No categories yet" body="Create the first category to let sellers submit products." />
          )}
        </section>
      </div>
    </div>
  );
}

export function AdminOrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') ?? '';
  const isDemo = searchParams.get('isDemo') ?? '';
  const fulfilment = searchParams.get('fulfilment') === 'open';
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const orders = useQuery({
    queryKey: ['admin-orders', q, status, isDemo, fulfilment, page],
    queryFn: () =>
      api<{ orders: AdminOrderRow[]; page: number; totalPages: number; total: number }>(
        `/admin/orders?page=${page}${status ? `&status=${encodeURIComponent(status)}` : ''}${isDemo ? `&isDemo=${isDemo}` : ''}${fulfilment ? '&fulfilment=open' : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
  });

  const setParam = (key: 'status' | 'isDemo', value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    setPage(1);
    setSearchParams(params, { replace: true });
  };

  const toggleFulfilment = () => {
    const params = new URLSearchParams(searchParams);
    if (fulfilment) params.delete('fulfilment');
    else params.set('fulfilment', 'open');
    setPage(1);
    setSearchParams(params, { replace: true });
  };

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Orders" lede="Marketplace orders split into seller shipments. Actions are recorded against the shipment and the audit log." />
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <Field label="Search"><Input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="Order, email or customer" /></Field>
        <Field label="Status">
          <Select value={status} onChange={(event) => setParam('status', event.target.value)} className="max-w-56">
            <option value="">All statuses</option>
            {Object.keys({ pending_payment: 1, paid: 1, partially_fulfilled: 1, fulfilled: 1, cancelled: 1, partially_refunded: 1, refunded: 1, expired: 1 }).map((value) => <option key={value} value={value}>{orderStatusLabel(value)}</option>)}
          </Select>
        </Field>
        <Field label="Order type">
          <Select value={isDemo} onChange={(event) => setParam('isDemo', event.target.value)} className="max-w-44">
            <option value="">All orders</option>
            <option value="false">Real orders only</option>
            <option value="true">Demo orders only</option>
          </Select>
        </Field>
        <Button
          type="button"
          size="sm"
          variant={fulfilment ? 'primary' : 'secondary'}
          onClick={toggleFulfilment}
          className="mb-0.5"
        >
          Awaiting dispatch
        </Button>
        <p className="pb-3 text-[11px] text-muted sm:ml-auto">
          {orders.data ? `${orders.data.total.toLocaleString('en-IN')} order${orders.data.total === 1 ? '' : 's'}` : 'Loading orders…'}
        </p>
      </div>
      <div className="mt-5">
        {orders.isLoading ? <LoadingBlock rows={4} /> : null}
        {orders.isError ? <ErrorState onRetry={() => void orders.refetch()} /> : null}
        {orders.data?.orders.length ? (
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="min-w-full text-left text-[12.5px]">
              <thead className="border-b border-line bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
                <tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Seller shipments</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Placed</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.data.orders.map((order) => (
                  <tr key={order.orderNumber}>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5">
                        <Link to={`/admin/orders/${order.orderNumber}`} className="font-medium text-forest hover:text-terra">{order.orderNumber}</Link>
                        {order.isDemo ? <Badge tone="sand">DEMO</Badge> : null}
                      </div>
                      {order.refundCount ? <p className="text-[10.5px] text-terra">{order.refundCount} refund record{order.refundCount === 1 ? '' : 's'}</p> : null}
                    </td>
                    <td className="px-4 py-4">{order.customerName}<p className="text-[10.5px] text-muted">{order.email} · {order.destination}</p></td>
                    <td className="px-4 py-4"><StatusBadge status={order.status} label={orderStatusLabel(order.status)} /></td>
                    <td className="px-4 py-4"><div className="flex flex-wrap gap-1">{order.sellerStatuses.map((sellerStatus, index) => <StatusBadge key={`${sellerStatus}-${index}`} status={sellerStatus} label={sellerOrderStatusLabel(sellerStatus)} />)}</div></td>
                    <td className="px-4 py-4">{formatINR(order.totalPaise)}</td>
                    <td className="px-4 py-4 text-muted">{formatDate(order.placedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={fulfilment ? 'No orders are awaiting dispatch' : 'No orders in this view'}
            body={
              fulfilment
                ? 'Every paid seller shipment has been dispatched, delivered or cancelled.'
                : 'Try a different status, order type or search term.'
            }
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQ('');
                  setPage(1);
                  setSearchParams(new URLSearchParams(), { replace: true });
                }}
              >
                Clear filters
              </Button>
            }
          />
        )}
        {orders.data ? <Pagination page={page} totalPages={orders.data.totalPages} onChange={setPage} /> : null}
      </div>
    </div>
  );
}

interface AdminOrderDetail {
  order: OrderView;
  payments: { id: string; provider: string; status: string; amount_paise: number; provider_order_id: string | null; provider_payment_id: string | null; method: string | null; verified_at: string | null; created_at: string }[];
  refunds: Record<string, unknown>[];
  returns: Record<string, unknown>[];
  cancellations: Record<string, unknown>[];
  events: { id: string; provider: string; provider_event_id: string; type: string; summary: string | null; processed_at: string }[];
}

export function AdminOrderDetailPage() {
  const { orderNumber = '' } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<{ sellerOrderId: string; action: string } | null>(null);
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const [cancelWholeOrderOpen, setCancelWholeOrderOpen] = useState(false);
  const [cancelNote, setCancelNote] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const detail = useQuery({
    queryKey: ['admin-order', orderNumber],
    queryFn: () => api<AdminOrderDetail>(`/admin/orders/${encodeURIComponent(orderNumber)}`),
    enabled: Boolean(orderNumber),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-order', orderNumber] });
    await queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
  };

  const submitAction = async () => {
    if (!action) return;
    if (action.action === 'ship') {
      if (carrier.trim().length < 2) {
        toast.push('Record the real carrier before marking this shipment dispatched.', 'error');
        return;
      }
      if (trackingNumber.trim().length < 4) {
        toast.push('Record the carrier tracking number before marking this shipment dispatched.', 'error');
        return;
      }
    }
    setBusy(true);
    try {
      await api(`/admin/orders/${encodeURIComponent(orderNumber)}/seller-orders/${action.sellerOrderId}/action`, {
        method: 'POST',
        body: {
          action: action.action,
          carrier: action.action === 'ship' ? carrier : undefined,
          trackingNumber: action.action === 'ship' ? trackingNumber : undefined,
          note: note || undefined,
        },
      });
      toast.push('Seller shipment updated.');
      setAction(null);
      setNote('');
      setCarrier('');
      setTrackingNumber('');
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancelWholeOrder = async () => {
    setCancelling(true);
    try {
      await api(`/admin/orders/${encodeURIComponent(orderNumber)}/status`, {
        method: 'POST',
        body: {
          action: 'cancel',
          note: cancelNote.trim() || 'Cancelled by administrator from admin order file',
        },
      });
      toast.push('Order cancelled and reserved stock restored.');
      setCancelWholeOrderOpen(false);
      setCancelNote('');
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setCancelling(false);
    }
  };

  if (detail.isLoading) return <LoadingBlock rows={4} />;
  if (detail.isError || !detail.data) return <ErrorState title="Order not found" onRetry={() => void detail.refetch()} />;
  const data = detail.data;
  const order = data.order;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Order file"
        title={order.orderNumber}
        lede={`${order.email} · placed ${formatDateTime(order.placedAt)} · payment ${order.payment?.status ?? 'none'}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {order.isDemo ? <Badge tone="sand">DEMO ORDER</Badge> : null}
            <StatusBadge status={order.status} label={orderStatusLabel(order.status)} />
            {order.status !== 'cancelled' && order.status !== 'fulfilled' ? (
              <Button size="sm" variant="danger" onClick={() => setCancelWholeOrderOpen(true)}>Cancel Order & Restore Stock</Button>
            ) : null}
          </div>
        }
      />

      {order.isDemo ? (
        <Alert tone="warning" title="DEMO ORDER — NOT A REAL PURCHASE">
          This is a simulated demo order recorded for local development and testing. Real payment was not collected, and no real delivery is required.
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          {order.sellerOrders.map((sellerOrder) => (
            <section key={sellerOrder.id} className="border border-line bg-surface">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div><h2 className="text-lg">{sellerOrder.sellerName}</h2><p className="text-[10.5px] text-muted">{sellerOrder.reference}</p></div>
                <StatusBadge status={sellerOrder.status} label={sellerOrderStatusLabel(sellerOrder.status)} />
              </div>
              <ul className="divide-y divide-line text-[12.5px]">
                {sellerOrder.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3 px-5 py-3"><span>{item.name}<span className="block text-[10.5px] text-muted">Qty {item.quantity} · {formatINR(item.unitPricePaise)} each</span></span><span>{formatINR(item.lineSubtotalPaise)}</span></li>
                ))}
              </ul>
              <div className="grid gap-2 border-t border-line px-5 py-3 text-[11.5px] sm:grid-cols-2">
                <span>Product value {formatINR(sellerOrder.subtotalPaise)}</span>
                <span>Shipping {formatINR(sellerOrder.shippingPaise)}</span>
                <span>Platform Fee {formatINR(sellerOrder.commissionPaise ?? 0)}</span>
                <span>Seller earning {formatINR(sellerOrder.sellerEarningPaise ?? 0)}</span>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
                {sellerOrder.status === 'pending' ? <Button size="sm" onClick={() => setAction({ sellerOrderId: sellerOrder.id, action: 'confirm' })}>Confirm</Button> : null}
                {['pending', 'confirmed'].includes(sellerOrder.status) ? <Button size="sm" variant="secondary" onClick={() => setAction({ sellerOrderId: sellerOrder.id, action: 'pack' })}>Pack</Button> : null}
                {['confirmed', 'packed'].includes(sellerOrder.status) ? <Button size="sm" onClick={() => setAction({ sellerOrderId: sellerOrder.id, action: 'ship' })}>Ship</Button> : null}
                {sellerOrder.status === 'shipped' ? <Button size="sm" onClick={() => setAction({ sellerOrderId: sellerOrder.id, action: 'deliver' })}>Deliver</Button> : null}
                {['pending', 'confirmed'].includes(sellerOrder.status) ? <Button size="sm" variant="danger" onClick={() => setAction({ sellerOrderId: sellerOrder.id, action: 'cancel' })}>Cancel</Button> : null}
              </div>
            </section>
          ))}
          <section className="border border-line bg-surface p-5">
            <h2 className="text-lg">Order timeline</h2>
            {order.timeline.length ? (
              <ol className="mt-3 space-y-2 text-[12px]">
                {order.timeline.map((event, index) => (
                  <li key={`${event.type}-${index}`} className="border-l border-line pl-3">
                    <p className="font-medium text-ink">{event.description}</p>
                    <p className="text-[10.5px] text-muted">{formatDateTime(event.occurredAt)}{event.actorRole ? ` · ${event.actorRole}` : ''}</p>
                  </li>
                ))}
              </ol>
            ) : <p className="mt-3 text-sm text-muted">No order events recorded.</p>}
          </section>
          <section className="border border-line bg-surface p-5">
            <h2 className="text-lg">Payment events</h2>
            {data.events.length ? (
              <ul className="mt-3 divide-y divide-line text-[12px]">
                {data.events.map((event) => (
                  <li key={event.id} className="py-2.5"><span className="font-medium">{event.type}</span><span className="text-muted"> · {event.provider} · {formatDateTime(event.processed_at)}</span><p className="break-all text-[10.5px] text-muted">{event.provider_event_id}</p></li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-muted">No payment events recorded.</p>}
          </section>
        </div>
        <aside className="space-y-5">
          <section className="border border-line bg-surface p-5">
            <h2 className="text-lg">Payment</h2>
            {data.payments.length ? (
              <ul className="mt-3 space-y-3 text-[11.5px]">
                {data.payments.map((payment) => (
                  <li key={payment.id} className="border-b border-line pb-2 last:border-0">
                    <p className="font-medium text-ink">{payment.provider} · {payment.status} · {formatINR(payment.amount_paise)}</p>
                    <p className="break-all text-muted">{payment.provider_payment_id ?? payment.provider_order_id ?? 'No provider reference'}</p>
                    <p className="text-muted">{payment.method ?? '—'} · {payment.verified_at ? formatDateTime(payment.verified_at) : 'Not verified'}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-muted">No payment record.</p>}
          </section>
          <section className="border border-line bg-surface p-5">
            <h2 className="text-lg">Delivery address</h2>
            <address className="mt-2 text-[12px] not-italic leading-relaxed text-ink/75">
              {order.shippingAddress.fullName}<br />{order.shippingAddress.line1}<br />
              {order.shippingAddress.line2 ? <>{order.shippingAddress.line2}<br /></> : null}
              {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.pincode}<br />{order.shippingAddress.phone}
            </address>
          </section>
          <section className="border border-line bg-surface p-5">
            <h2 className="text-lg">Refunds & returns</h2>
            <p className="mt-2 text-[12px] text-muted">{data.refunds.length} refund record(s) · {data.returns.length} return(s) · {data.cancellations.length} cancellation(s).</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <LinkButton to="/admin/refunds" size="sm" variant="secondary">Refund queue</LinkButton>
              <LinkButton to="/admin/returns" size="sm" variant="secondary">Returns</LinkButton>
            </div>
          </section>
        </aside>
      </div>

      <Modal
        open={cancelWholeOrderOpen}
        onClose={() => setCancelWholeOrderOpen(false)}
        title={`Cancel Order ${order.orderNumber}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelWholeOrderOpen(false)}>Back</Button>
            <Button variant="danger" loading={cancelling} onClick={() => void cancelWholeOrder()}>Confirm Cancellation & Restore Inventory</Button>
          </>
        }
      >
        <div className="space-y-3 text-left">
          <Alert tone="warning">
            Cancelling this order will release all reserved inventory items back to available stock immediately and update the order status to cancelled.
          </Alert>
          <Field label="Cancellation note" hint="Optional audit reference">
            <Textarea
              rows={3}
              value={cancelNote}
              onChange={(e) => setCancelNote(e.target.value)}
              placeholder="Reason for order cancellation..."
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(action)}
        onClose={() => setAction(null)}
        title={action ? `Shipment action: ${humanise(action.action)}` : 'Shipment action'}
        footer={<><Button variant="ghost" onClick={() => setAction(null)}>Cancel</Button><Button loading={busy} onClick={() => void submitAction()}>Record action</Button></>}
      >
        <div className="space-y-4">
          {action?.action === 'ship' ? (
            <>
              <Alert tone="info">Shipping is manual in this build. Record the real carrier and tracking number.</Alert>
              <Field label="Carrier" required><Input value={carrier} onChange={(event) => setCarrier(event.target.value)} /></Field>
              <Field label="Tracking number" required><Input value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} /></Field>
            </>
          ) : null}
          <Field label="Note" hint="Optional, audit only"><Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------- Payments -------------------------------- */

interface AdminPaymentRow {
  id: string;
  provider: string;
  status: string;
  amount_paise: number;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  method: string | null;
  verified_at: string | null;
  failure_reason: string | null;
  created_at: string;
  order_number: string;
  order_status: string;
}

const PAYMENT_STATUSES = ['created', 'pending', 'paid', 'failed', 'cancelled'];

export function AdminPaymentsPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const payments = useQuery({
    queryKey: ['admin-payments', status, page],
    queryFn: () =>
      api<{ payments: AdminPaymentRow[]; page: number; total: number; totalPages: number }>(
        `/admin/payments?page=${page}${status ? `&status=${encodeURIComponent(status)}` : ''}`,
      ),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Money movement"
        title="Payments"
        lede="Provider records attached to orders. A payment is only treated as settled when it is verified by the server, not when the browser returns from checkout."
      />
      <Alert tone="info" title="What this view can and cannot confirm">
        Real Razorpay captures appear only when live or test API keys are configured. Payments created by the development
        simulator are marked as simulated in the payment reference and did not move money.
      </Alert>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <Field label="Status">
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="max-w-52">
            <option value="">All statuses</option>
            {PAYMENT_STATUSES.map((value) => <option key={value} value={value}>{humanise(value)}</option>)}
          </Select>
        </Field>
        <p className="pb-3 text-[11px] text-muted">{payments.data?.total ?? 0} payment records</p>
      </div>
      <div className="mt-5">
        {payments.isLoading ? <LoadingBlock rows={4} /> : null}
        {payments.isError ? <ErrorState onRetry={() => void payments.refetch()} /> : null}
        {payments.data?.payments.length ? (
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="min-w-full text-left text-[12.5px]">
              <thead className="border-b border-line bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
                <tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Created</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {payments.data.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-4 py-4"><Link to={`/admin/orders/${payment.order_number}`} className="font-medium text-forest hover:text-terra">{payment.order_number}</Link><p className="text-[10.5px] text-muted">{orderStatusLabel(payment.order_status)}</p></td>
                    <td className="px-4 py-4">{humanise(payment.provider)}<p className="text-[10.5px] text-muted">{payment.method ?? 'method not recorded'}</p></td>
                    <td className="px-4 py-4"><StatusBadge status={payment.status} />{payment.failure_reason ? <p className="mt-1 max-w-48 text-[10.5px] text-terra">{payment.failure_reason}</p> : null}</td>
                    <td className="px-4 py-4">{formatINR(payment.amount_paise)}</td>
                    <td className="px-4 py-4"><span className="block max-w-52 break-all text-[11px] text-muted">{payment.provider_payment_id ?? payment.provider_order_id ?? 'No provider reference'}</span></td>
                    <td className="px-4 py-4 text-muted">{formatDateTime(payment.created_at)}<p className="text-[10.5px]">{payment.verified_at ? `Verified ${formatDateTime(payment.verified_at)}` : 'Not verified'}</p></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No payment records in this view" body="Payments appear when checkout starts. No money has moved unless a provider reference is present and verified." />}
        {payments.data ? <Pagination page={page} totalPages={payments.data.totalPages} onChange={setPage} /> : null}
      </div>
    </div>
  );
}

/* --------------------------------- Refunds -------------------------------- */

interface AdminRefundRow {
  id: string;
  order_number: string;
  email: string;
  seller_name: string | null;
  amount_paise: number;
  reason: string;
  status: string;
  requested_by: string;
  created_at: string;
  decided_at: string | null;
  provider: string | null;
  provider_payment_id: string | null;
  provider_refund_id: string | null;
  provider_status: string | null;
}

export function AdminRefundsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') ?? '';
  const [refund, setRefund] = useState<AdminRefundRow | null>(null);
  const [completing, setCompleting] = useState(false);
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [method, setMethod] = useState<'manual' | 'razorpay'>('manual');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const refunds = useQuery({
    queryKey: ['admin-refunds', status],
    queryFn: () => api<{ refunds: AdminRefundRow[] }>(`/admin/refunds${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  });

  const open = (row: AdminRefundRow) => {
    setRefund(row);
    setCompleting(row.status === 'approved');
    setDecision('approve');
    setMethod(row.provider === 'razorpay' && row.provider_payment_id ? 'razorpay' : 'manual');
    setReference('');
    setNote('');
  };

  const submit = async () => {
    if (!refund) return;
    if (completing && reference.trim().length < 4) {
      toast.push('Enter the verified bank or UPI reference for the completed transfer.', 'error');
      return;
    }
    if (!completing && decision === 'approve' && method === 'manual' && reference.trim().length < 4) {
      toast.push('Enter the bank or UPI reference for the refund.', 'error');
      return;
    }
    setBusy(true);
    try {
      const result = completing
        ? await api<{ status: string; message: string }>(`/admin/refunds/${refund.id}/complete-manual`, {
            method: 'POST',
            body: { manualReference: reference.trim(), note: note.trim() || undefined },
          })
        : await api<{ status: string; message: string }>(`/admin/refunds/${refund.id}/decide`, {
            method: 'POST',
            body: {
              decision,
              method: decision === 'approve' ? method : undefined,
              manualReference: decision === 'approve' && method === 'manual' ? reference.trim() : undefined,
              note: note.trim() || undefined,
            },
          });
      toast.push(result.message);
      setRefund(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-refunds'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-order'] });
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Customer money back"
        title="Refunds"
        lede="Approve only against a verified payment or record a real manual bank/UPI transfer reference. Approving here does not by itself move money."
      />
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <Field label="Status">
          <Select
            value={status}
            onChange={(event) => {
              const params = new URLSearchParams(searchParams);
              if (event.target.value) params.set('status', event.target.value);
              else params.delete('status');
              setSearchParams(params, { replace: true });
            }}
            className="max-w-52"
          >
            <option value="">All statuses</option>
            {['requested', 'approved', 'processing', 'completed', 'rejected', 'failed'].map((value) => <option key={value} value={value}>{humanise(value)}</option>)}
          </Select>
        </Field>
        <p className="pb-3 text-[11px] text-muted">{refunds.data?.refunds.length ?? 0} refund records</p>
      </div>
      <div className="mt-5">
        {refunds.isLoading ? <LoadingBlock rows={4} /> : null}
        {refunds.isError ? <ErrorState onRetry={() => void refunds.refetch()} /> : null}
        {refunds.data?.refunds.length ? (
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="min-w-full text-left text-[12.5px]">
              <thead className="border-b border-line bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
                <tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Seller shipment</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Requested</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {refunds.data.refunds.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-4"><Link to={`/admin/orders/${row.order_number}`} className="font-medium text-forest hover:text-terra">{row.order_number}</Link><p className="text-[10.5px] text-muted">{row.email}</p></td>
                    <td className="px-4 py-4">{row.seller_name ?? 'Order-level'}</td>
                    <td className="px-4 py-4">{formatINR(row.amount_paise)}</td>
                    <td className="px-4 py-4"><span className="block max-w-56 whitespace-pre-wrap text-[11.5px] text-muted">{row.reason}</span></td>
                    <td className="px-4 py-4"><StatusBadge status={row.status} />{row.provider_refund_id ? <p className="mt-1 max-w-40 break-all text-[10px] text-muted">{row.provider_refund_id}</p> : null}</td>
                    <td className="px-4 py-4 text-muted">{formatDateTime(row.created_at)}</td>
                    <td className="px-4 py-4 text-right">
                      {['requested', 'failed'].includes(row.status) ? (
                        <Button size="sm" variant="secondary" onClick={() => open(row)}>Review</Button>
                      ) : row.status === 'approved' ? (
                        <Button size="sm" variant="secondary" onClick={() => open(row)}>Record transfer</Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No refund requests" body="Refunds raised from a cancellation or return appear here for a recorded decision." />}
      </div>

      <Modal
        open={Boolean(refund)}
        onClose={() => setRefund(null)}
        title={refund ? `Refund ${formatINR(refund.amount_paise)} — ${refund.order_number}` : 'Refund'}
        footer={<><Button variant="ghost" onClick={() => setRefund(null)}>Cancel</Button><Button loading={busy} onClick={() => void submit()}>{completing ? 'Record completed transfer' : 'Record decision'}</Button></>}
      >
        {refund ? (
          <div className="space-y-4">
            <dl className="grid gap-2 border border-line bg-paper p-3 text-[12px] sm:grid-cols-2">
              <div><dt className="text-muted">Requested by</dt><dd className="break-all">{refund.requested_by}</dd></div>
              <div><dt className="text-muted">Provider payment</dt><dd className="break-all">{refund.provider_payment_id ?? 'None attached'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted">Reason</dt><dd className="whitespace-pre-wrap">{refund.reason}</dd></div>
            </dl>
            {completing ? (
              <>
                <Alert tone="warning">
                  Only record this after the bank/UPI transfer is genuinely complete. This writes the completion
                  evidence to the audit log and updates the customer's order.
                </Alert>
                <Field label="Verified bank / UPI reference" required hint="UTR, transaction ID or receipt number">
                  <Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="UTR or transaction ID" />
                </Field>
              </>
            ) : (
              <>
                <Field label="Decision">
                  <Select value={decision} onChange={(event) => setDecision(event.target.value as 'approve' | 'reject')}>
                    <option value="approve">Approve</option>
                    <option value="reject">Reject</option>
                  </Select>
                </Field>
                {decision === 'approve' ? (
                  <>
                    <Field label="Refund route" hint="A manual transfer is the only route without a verified provider payment.">
                      <Select value={method} onChange={(event) => setMethod(event.target.value as 'manual' | 'razorpay')}>
                        <option value="manual">Manual bank / UPI transfer</option>
                        <option value="razorpay" disabled={!refund.provider_payment_id}>Razorpay reversal</option>
                      </Select>
                    </Field>
                    {method === 'manual' ? (
                      <Field label="Planned transfer reference" required hint="Approval records the plan only; completion is a separate step.">
                        <Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="UTR, transaction ID or receipt number" />
                      </Field>
                    ) : (
                      <Alert tone="warning">A Razorpay reversal needs configured API keys. If the request fails, no refund is recorded as complete.</Alert>
                    )}
                  </>
                ) : null}
              </>
            )}
            <Field label="Internal note" hint="Optional"><Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/* --------------------------------- Returns -------------------------------- */

interface AdminReturnRow {
  id: string;
  order_number: string;
  seller_name: string | null;
  item_name: string | null;
  reason: string;
  description: string | null;
  status: string;
  resolution_note: string | null;
  created_at: string;
}

export function AdminReturnsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') ?? '';
  const [request, setRequest] = useState<AdminReturnRow | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const returns = useQuery({
    queryKey: ['admin-returns', status],
    queryFn: () => api<{ returns: AdminReturnRow[] }>(`/admin/returns${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  });

  const submit = async () => {
    if (!request) return;
    if (note.trim().length < 3) {
      toast.push('Add a short note for the customer (at least 3 characters).', 'error');
      return;
    }
    let amountPaise: number | undefined;
    if (amount.trim()) {
      amountPaise = Math.round(Number(amount) * 100);
      if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
        toast.push('Enter a valid refund amount or leave it blank for the full shipment total.', 'error');
        return;
      }
    }
    setBusy(true);
    try {
      await api(`/admin/returns/${request.id}/decision`, {
        method: 'POST',
        body: { decision, note: note.trim(), amountPaise },
      });
      toast.push(decision === 'approve' ? 'Return approved and a refund queued.' : 'Return rejected and recorded.');
      setRequest(null);
      setNote('');
      setAmount('');
      await queryClient.invalidateQueries({ queryKey: ['admin-returns'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-refunds'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="After delivery"
        title="Returns"
        lede="Return requests are reviewed with the shipment history. Approval creates a refund request; it does not silently mark money as returned."
      />
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <Field label="Status">
          <Select
            value={status}
            onChange={(event) => {
              const params = new URLSearchParams(searchParams);
              if (event.target.value) params.set('status', event.target.value);
              else params.delete('status');
              setSearchParams(params, { replace: true });
            }}
            className="max-w-52"
          >
            <option value="">All statuses</option>
            {['requested', 'approved', 'rejected', 'completed'].map((value) => (
              <option key={value} value={value}>{humanise(value)}</option>
            ))}
          </Select>
        </Field>
        <p className="pb-3 text-[11px] text-muted">{returns.data?.returns.length ?? 0} return requests</p>
      </div>
      <div className="mt-5">
        {returns.isLoading ? <LoadingBlock rows={4} /> : null}
        {returns.isError ? <ErrorState onRetry={() => void returns.refetch()} /> : null}
        {returns.data?.returns.length ? (
          <div className="space-y-3">
            {returns.data.returns.map((row) => (
              <section key={row.id} className="border border-line bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link to={`/admin/orders/${row.order_number}`} className="font-medium text-forest hover:text-terra">{row.order_number}</Link>
                    <p className="text-[11px] text-muted">{row.seller_name ?? 'Seller not recorded'} · {row.item_name ?? 'Shipment'} · requested {formatDateTime(row.created_at)}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <p className="mt-3 text-[12.5px]"><span className="font-medium text-ink">{row.reason}</span>{row.description ? <span className="block whitespace-pre-wrap text-muted">{row.description}</span> : null}</p>
                {row.resolution_note ? <p className="mt-2 border-l-2 border-sand pl-3 text-[11.5px] text-muted">Resolution: {row.resolution_note}</p> : null}
                {row.status === 'requested' ? (
                  <div className="mt-3">
                    <Button size="sm" variant="secondary" onClick={() => { setRequest(row); setDecision('approve'); setNote(''); setAmount(''); }}>Review request</Button>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            title={status === 'requested' ? 'No returns waiting for review' : 'No return requests in this view'}
            body="Customers can request a return from a delivered order in their account."
          />
        )}
      </div>

      <Modal
        open={Boolean(request)}
        onClose={() => setRequest(null)}
        title={request ? `Return review — ${request.order_number}` : 'Return review'}
        footer={<><Button variant="ghost" onClick={() => setRequest(null)}>Cancel</Button><Button loading={busy} onClick={() => void submit()}>Record decision</Button></>}
      >
        <div className="space-y-4">
          <Field label="Decision">
            <Select value={decision} onChange={(event) => setDecision(event.target.value as 'approve' | 'reject')}>
              <option value="approve">Approve and queue a refund</option>
              <option value="reject">Reject</option>
            </Select>
          </Field>
          {decision === 'approve' ? (
            <Field label="Refund amount" hint="₹, optional — leave blank for the shipment total">
              <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </Field>
          ) : null}
          <Field label="Note to customer" required><Textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
          <Alert tone="info">The customer sees this note. Approval creates a refund request that must still be completed through the refund queue.</Alert>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------ Cancellations ----------------------------- */

interface AdminCancellationRow {
  id: string;
  order_number: string;
  email: string;
  seller_name: string | null;
  reason: string;
  status: string;
  resolution_note: string | null;
  created_at: string;
}

export function AdminCancellationsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [request, setRequest] = useState<AdminCancellationRow | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const cancellations = useQuery({
    queryKey: ['admin-cancellations'],
    queryFn: () => api<{ cancellations: AdminCancellationRow[] }>('/admin/cancellations'),
  });

  const submit = async () => {
    if (!request) return;
    if (note.trim().length < 3) {
      toast.push('Add a short note (at least 3 characters).', 'error');
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/cancellations/${request.id}/decision`, {
        method: 'POST',
        body: { decision, note: note.trim() },
      });
      toast.push(decision === 'approve' ? 'Cancellation approved and shipment cancelled.' : 'Cancellation request rejected.');
      setRequest(null);
      setNote('');
      await queryClient.invalidateQueries({ queryKey: ['admin-cancellations'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Before dispatch"
        title="Cancellations"
        lede="Customer cancellation requests for seller shipments. Approving cancels the shipment and releases its reservation; any captured payment must be refunded through the refund queue."
      />
      <div className="mt-5">
        {cancellations.isLoading ? <LoadingBlock rows={4} /> : null}
        {cancellations.isError ? <ErrorState onRetry={() => void cancellations.refetch()} /> : null}
        {cancellations.data?.cancellations.length ? (
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="min-w-full text-left text-[12.5px]">
              <thead className="border-b border-line bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
                <tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Seller</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Requested</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {cancellations.data.cancellations.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-4"><Link to={`/admin/orders/${row.order_number}`} className="font-medium text-forest hover:text-terra">{row.order_number}</Link><p className="text-[10.5px] text-muted">{row.email}</p></td>
                    <td className="px-4 py-4">{row.seller_name ?? '—'}</td>
                    <td className="px-4 py-4"><span className="block max-w-64 whitespace-pre-wrap text-[11.5px] text-muted">{row.reason}</span></td>
                    <td className="px-4 py-4"><StatusBadge status={row.status} />{row.resolution_note ? <p className="mt-1 max-w-48 text-[10.5px] text-muted">{row.resolution_note}</p> : null}</td>
                    <td className="px-4 py-4 text-muted">{formatDateTime(row.created_at)}</td>
                    <td className="px-4 py-4 text-right">{row.status === 'requested' ? <Button size="sm" variant="secondary" onClick={() => { setRequest(row); setDecision('approve'); setNote(''); }}>Review</Button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No cancellation requests" body="Customers can request cancellation while a shipment has not been dispatched." />}
      </div>

      <Modal
        open={Boolean(request)}
        onClose={() => setRequest(null)}
        title={request ? `Cancellation review — ${request.order_number}` : 'Cancellation review'}
        footer={<><Button variant="ghost" onClick={() => setRequest(null)}>Cancel</Button><Button loading={busy} onClick={() => void submit()}>Record decision</Button></>}
      >
        <div className="space-y-4">
          <Field label="Decision">
            <Select value={decision} onChange={(event) => setDecision(event.target.value as 'approve' | 'reject')}>
              <option value="approve">Approve cancellation</option>
              <option value="reject">Reject request</option>
            </Select>
          </Field>
          <Field label="Note to customer" required><Textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------- Commissions ------------------------------ */

interface CommissionRuleRow {
  id: string;
  scope: string;
  category_id: string | null;
  seller_id: string | null;
  rate_bp: number;
  is_active: number;
  effective_from: string;
  created_at: string;
  category_name: string | null;
  seller_name: string | null;
  created_by_email: string | null;
}

interface CommissionEntryRow {
  id: string;
  basis_paise: number;
  rate_bp: number;
  amount_paise: number;
  created_at: string;
  reference: string;
  seller_name: string;
  order_number: string;
}

export function AdminCommissionsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<'global' | 'category' | 'seller'>('global');
  const [rate, setRate] = useState('15');
  const [categoryId, setCategoryId] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(todayInput());
  const [busy, setBusy] = useState(false);
  const data = useQuery({
    queryKey: ['admin-commissions'],
    queryFn: () =>
      api<{ rules: CommissionRuleRow[]; entries: CommissionEntryRow[]; summary: { booked: number; reversed: number; count: number }; defaultRateBp: number }>(
        '/admin/commissions',
      ),
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<{ categories: Category[] }>('/categories'),
  });
  const sellers = useQuery({
    queryKey: ['admin-sellers', 'approved'],
    queryFn: () => api<{ sellers: SellerRow[] }>('/admin/sellers?status=approved&pageSize=100'),
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const rateBp = Math.round(Number(rate) * 100);
    if (!Number.isFinite(rateBp) || rateBp < 0 || rateBp > 5000) {
      toast.push('Enter a commission between 0% and 50%.', 'error');
      return;
    }
    if (scope === 'category' && !categoryId) {
      toast.push('Choose a category for a category rule.', 'error');
      return;
    }
    if (scope === 'seller' && !sellerId) {
      toast.push('Choose a seller for a seller rule.', 'error');
      return;
    }
    setBusy(true);
    try {
      await api('/admin/commissions', {
        method: 'POST',
        body: {
          scope,
          categoryId: scope === 'category' ? categoryId : undefined,
          sellerId: scope === 'seller' ? sellerId : undefined,
          rateBp,
          effectiveFrom: dateInputToIso(effectiveFrom),
        },
      });
      toast.push('Commission rule saved. Earlier rules at the same scope are deactivated.');
      await queryClient.invalidateQueries({ queryKey: ['admin-commissions'] });
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const summary = data.data?.summary;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Take rate"
        title="Platform Fees"
        lede="Platform fee (12%) is charged on product value after discounts, excluding shipping and tax. Seller rules override category rules, which override the global default. Rates are snapshotted on each order."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Platform fee booked" value={formatINR(summary?.booked ?? 0)} note={`${summary?.count ?? 0} seller shipments`} />
        <Stat label="Reversed on refunds" value={formatINR(summary?.reversed ?? 0)} tone="warning" />
        <Stat label="Active rules" value={data.data?.rules.filter((rule) => rule.is_active).length ?? 0} />
        <Stat label="Default rate" value={percentFromBp(data.data?.defaultRateBp ?? 0)} note="Server default, overridden by rules" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="border border-line bg-surface p-5">
          <h2 className="text-lg">Set a rule</h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">Saving a rule deactivates the previous active rule at the same scope. Existing orders keep their snapshotted rate.</p>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <Field label="Scope">
              <Select value={scope} onChange={(event) => setScope(event.target.value as 'global' | 'category' | 'seller')}>
                <option value="global">Global default</option>
                <option value="category">Category</option>
                <option value="seller">Seller</option>
              </Select>
            </Field>
            {scope === 'category' ? (
              <Field label="Category" required>
                <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">Choose a category</option>
                  {categories.data?.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </Select>
              </Field>
            ) : null}
            {scope === 'seller' ? (
              <Field label="Seller" required>
                <Select value={sellerId} onChange={(event) => setSellerId(event.target.value)}>
                  <option value="">Choose a seller</option>
                  {sellers.data?.sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.business_name}</option>)}
                </Select>
              </Field>
            ) : null}
            <Field label="Rate" required hint="Percent of product value">
              <Input inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} />
            </Field>
            <Field label="Effective from" required>
              <Input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
            </Field>
            <Button type="submit" loading={busy}>Save rule</Button>
          </form>
        </section>

        <section className="border border-line bg-surface">
          <div className="border-b border-line px-5 py-4"><h2 className="text-lg">Rules</h2></div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[12.5px]">
              <thead className="bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
                <tr><th className="px-4 py-2.5">Scope</th><th className="px-4 py-2.5">Applies to</th><th className="px-4 py-2.5">Rate</th><th className="px-4 py-2.5">Effective</th><th className="px-4 py-2.5">State</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.data?.rules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="px-4 py-3">{humanise(rule.scope)}</td>
                    <td className="px-4 py-3">{rule.scope === 'category' ? rule.category_name ?? '—' : rule.scope === 'seller' ? rule.seller_name ?? '—' : 'All listings'}</td>
                    <td className="px-4 py-3">{percentFromBp(rule.rate_bp)}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(rule.effective_from)}</td>
                    <td className="px-4 py-3"><StatusBadge status={rule.is_active ? 'active' : 'paused'} label={rule.is_active ? 'Active' : 'Inactive'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.isError ? <div className="p-4"><ErrorState onRetry={() => void data.refetch()} /></div> : null}
        </section>
      </div>

      <section className="border border-line bg-surface">
        <div className="border-b border-line px-5 py-4"><h2 className="text-lg">Recent platform fee entries</h2><p className="mt-1 text-[11px] text-muted">Snapshotted when a payment is verified. Refund reversals are separate ledger entries.</p></div>
        {data.data?.entries.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[12.5px]">
              <thead className="bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
                <tr><th className="px-4 py-2.5">Order</th><th className="px-4 py-2.5">Seller</th><th className="px-4 py-2.5">Basis</th><th className="px-4 py-2.5">Rate</th><th className="px-4 py-2.5">Platform Fee</th><th className="px-4 py-2.5">Created</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.data.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3">{entry.order_number}<p className="text-[10px] text-muted">{entry.reference}</p></td>
                    <td className="px-4 py-3">{entry.seller_name}</td>
                    <td className="px-4 py-3">{formatINR(entry.basis_paise)}</td>
                    <td className="px-4 py-3">{percentFromBp(entry.rate_bp)}</td>
                    <td className="px-4 py-3">{formatINR(entry.amount_paise)}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(entry.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="px-5 py-8 text-center text-sm text-muted">No commission entries yet.</p>}
      </section>
    </div>
  );
}

/* ------------------------------- Settlements ------------------------------ */

interface SettlementRow {
  id: string;
  seller_id: string;
  seller_name: string;
  reference: string;
  period_start: string;
  period_end: string;
  gross_paise: number;
  commission_paise: number;
  refunds_paise: number;
  adjustments_paise: number;
  net_paise: number;
  status: string;
  provider_reference: string | null;
  note: string | null;
  paid_at: string | null;
  created_at: string;
  entry_count: number;
}

interface SettlementItem {
  id: string;
  type: string;
  amount_paise: number;
  ledger_status: string;
  reference: string;
  note: string | null;
  created_at: string;
  order_number: string | null;
}

export function AdminSettlementsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [sellerId, setSellerId] = useState('');
  const [periodStart, setPeriodStart] = useState(daysAgoInput(30));
  const [periodEnd, setPeriodEnd] = useState(todayInput());
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [paying, setPaying] = useState(false);
  const settlements = useQuery({
    queryKey: ['admin-settlements'],
    queryFn: () => api<{ settlements: SettlementRow[] }>('/admin/settlements'),
  });
  const sellers = useQuery({
    queryKey: ['admin-sellers', 'approved'],
    queryFn: () => api<{ sellers: SellerRow[] }>('/admin/sellers?status=approved&pageSize=100'),
  });
  const detail = useQuery({
    queryKey: ['admin-settlement', selectedId],
    queryFn: () => api<{ settlement: SettlementRow; items: SettlementItem[] }>(`/admin/settlements/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!sellerId) {
      toast.push('Choose a seller.', 'error');
      return;
    }
    if (!periodStart || !periodEnd || periodStart > periodEnd) {
      toast.push('The settlement period must start on or before the end date.', 'error');
      return;
    }
    setCreating(true);
    try {
      const result = await api<{ id: string; reference: string; netPaise: number }>('/admin/settlements', {
        method: 'POST',
        body: {
          sellerId,
          periodStart: dateInputToIso(periodStart),
          periodEnd: dateInputToIso(periodEnd, true),
        },
      });
      toast.push(`Settlement ${result.reference} created for ${formatINR(result.netPaise)}.`);
      await queryClient.invalidateQueries({ queryKey: ['admin-settlements'] });
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setCreating(false);
    }
  };

  const markPaid = async () => {
    if (!selectedId) return;
    if (reference.trim().length < 4) {
      toast.push('Record the real bank or UPI reference (at least 4 characters).', 'error');
      return;
    }
    setPaying(true);
    try {
      await api(`/admin/settlements/${selectedId}/pay`, {
        method: 'POST',
        body: { providerReference: reference.trim(), note: note.trim() || undefined },
      });
      toast.push('Settlement recorded as paid. No payout was initiated by this application.');
      setReference('');
      setNote('');
      await queryClient.invalidateQueries({ queryKey: ['admin-settlements'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-settlement', selectedId] });
      await queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Seller balances"
        title="Settlements"
        lede="Settlements group eligible ledger entries for a period. Marking one paid records a manual bank/UPI transfer you have actually made — this application does not initiate payouts."
      />
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="border border-line bg-surface p-5">
          <h2 className="text-lg">Create a batch</h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">Only eligible, unsettled entries are included. Negative adjustments reduce the net amount. A batch cannot be created twice for the same entries.</p>
          <form onSubmit={create} className="mt-4 space-y-3">
            <Field label="Seller" required>
              <Select value={sellerId} onChange={(event) => setSellerId(event.target.value)}>
                <option value="">Choose a seller</option>
                {sellers.data?.sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.business_name}</option>)}
              </Select>
            </Field>
            <Field label="Period start" required><Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></Field>
            <Field label="Period end" required><Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></Field>
            <Button type="submit" loading={creating}>Create settlement</Button>
          </form>
        </section>

        <section className="border border-line bg-surface">
          <div className="border-b border-line px-5 py-4"><h2 className="text-lg">Batches</h2></div>
          {settlements.isLoading ? <div className="p-5"><LoadingBlock rows={3} /></div> : null}
          {settlements.isError ? <div className="p-5"><ErrorState onRetry={() => void settlements.refetch()} /></div> : null}
          {settlements.data?.settlements.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[12.5px]">
                <thead className="bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
                  <tr><th className="px-4 py-2.5">Reference</th><th className="px-4 py-2.5">Seller</th><th className="px-4 py-2.5">Period</th><th className="px-4 py-2.5">Net</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5" /></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {settlements.data.settlements.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-medium text-ink">{row.reference}<p className="text-[10px] text-muted">{row.entry_count} ledger entries</p></td>
                      <td className="px-4 py-3">{row.seller_name}</td>
                      <td className="px-4 py-3 text-muted">{formatDate(row.period_start)} – {formatDate(row.period_end)}</td>
                      <td className="px-4 py-3">{formatINR(row.net_paise)}</td>
                      <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                      <td className="px-4 py-3 text-right"><Button size="sm" variant="secondary" onClick={() => { setSelectedId(row.id); setReference(''); setNote(''); }}>Open</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="px-5 py-8 text-center text-sm text-muted">No settlement batches yet.</p>}
        </section>
      </div>

      <Modal
        open={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        title={detail.data ? `Settlement ${detail.data.settlement.reference}` : 'Settlement'}
        wide
        footer={<Button variant="ghost" onClick={() => setSelectedId(null)}>Close</Button>}
      >
        {detail.isLoading ? <LoadingBlock rows={3} /> : null}
        {detail.isError ? <ErrorState onRetry={() => void detail.refetch()} /> : null}
        {detail.data ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat label="Seller" value={<span className="text-lg">{detail.data.settlement.seller_name}</span>} note={`${formatDate(detail.data.settlement.period_start)} – ${formatDate(detail.data.settlement.period_end)}`} />
              <Stat label="Net payable" value={formatINR(detail.data.settlement.net_paise)} note={`${detail.data.settlement.entry_count} entries`} />
            </div>
            <dl className="grid gap-2 border border-line bg-paper p-3 text-[12px] sm:grid-cols-2">
              <div className="flex justify-between"><dt className="text-muted">Sales</dt><dd>{formatINR(detail.data.settlement.gross_paise)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Platform Fee</dt><dd>{formatINR(-detail.data.settlement.commission_paise)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Refund deductions</dt><dd>{formatINR(-detail.data.settlement.refunds_paise)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Adjustments</dt><dd>{formatINR(detail.data.settlement.adjustments_paise)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 font-medium sm:col-span-2"><dt>Net</dt><dd>{formatINR(detail.data.settlement.net_paise)}</dd></div>
            </dl>
            <div>
              <h3 className="text-base">Ledger entries</h3>
              <ul className="mt-2 divide-y divide-line border border-line text-[11.5px]">
                {detail.data.items.map((item) => (
                  <li key={item.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                    <span>{humanise(item.type)}<span className="block text-[10px] text-muted">{item.order_number ?? item.reference} · {item.note ?? 'No note'}</span></span>
                    <span className="flex items-center gap-3">{formatINR(item.amount_paise)}<StatusBadge status={item.ledger_status} /></span>
                  </li>
                ))}
              </ul>
            </div>
            {detail.data.settlement.status !== 'paid' ? (
              <div className="border border-line bg-surface p-4">
                <h3 className="text-base">Record manual payment</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">Only do this after the transfer has cleared in your bank or UPI account. The reference is shown to the seller.</p>
                <div className="mt-3 space-y-3">
                  <Field label="Bank / UPI reference" required><Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="UTR or transaction ID" /></Field>
                  <Field label="Note" hint="Optional"><Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
                  <Button loading={paying} onClick={() => void markPaid()}>Mark as paid</Button>
                </div>
              </div>
            ) : (
              <Alert tone="success" title="Recorded as paid">
                {detail.data.settlement.provider_reference ?? 'Reference not recorded'} · {formatDateTime(detail.data.settlement.paid_at)}
              </Alert>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/* -------------------------------- Customers ------------------------------- */

interface CustomerRow {
  id: string;
  email: string;
  fullName: string | null;
  emailVerified: boolean;
  disabled: boolean;
  createdAt: string;
  orderCount: number;
  paidTotalPaise: number;
  roles: string[];
}

export function AdminCustomersPage() {
  const [q, setQ] = useState('');
  const deferredQ = useDeferredValue(q.trim());
  const [page, setPage] = useState(1);
  const customers = useQuery({
    queryKey: ['admin-customers', deferredQ, page],
    queryFn: () => api<{ customers: CustomerRow[]; page: number; total: number; totalPages: number }>(`/admin/customers?page=${page}${deferredQ ? `&q=${encodeURIComponent(deferredQ)}` : ''}`),
  });

  return (
    <div>
      <PageHeader
        eyebrow="People"
        title="Customers"
        lede="Registered accounts, roles and paid order history. Identity data is minimised; there is deliberately no impersonation control."
      />
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <Field label="Search"><Input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="Email or name" /></Field>
        <p className="pb-3 text-[11px] text-muted">{customers.data?.total ?? 0} accounts</p>
      </div>
      <div className="mt-5">
        {customers.isLoading ? <LoadingBlock rows={4} /> : null}
        {customers.isError ? <ErrorState onRetry={() => void customers.refetch()} /> : null}
        {customers.data?.customers.length ? (
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="min-w-full text-left text-[12.5px]">
              <thead className="border-b border-line bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
                <tr><th className="px-4 py-3">Account</th><th className="px-4 py-3">Roles</th><th className="px-4 py-3">Orders</th><th className="px-4 py-3">Paid total</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Joined</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {customers.data.customers.map((customer) => (
                  <tr key={customer.id}>
                    <td className="px-4 py-4"><span className="font-medium text-ink">{customer.fullName || 'No name recorded'}</span><p className="text-[10.5px] text-muted">{customer.email}{customer.disabled ? ' · disabled' : ''}</p></td>
                    <td className="px-4 py-4"><div className="flex flex-wrap gap-1">{customer.roles.map((role) => <Badge key={role} tone={role === 'admin' ? 'terra' : role === 'seller' ? 'forest' : 'neutral'}>{role}</Badge>)}</div></td>
                    <td className="px-4 py-4">{customer.orderCount}</td>
                    <td className="px-4 py-4">{formatINR(customer.paidTotalPaise)}</td>
                    <td className="px-4 py-4"><StatusBadge status={customer.emailVerified ? 'verified' : 'pending'} label={customer.emailVerified ? 'Verified' : 'Unverified'} /></td>
                    <td className="px-4 py-4 text-muted">{formatDate(customer.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No accounts in this view" />}
        {customers.data ? <Pagination page={page} totalPages={customers.data.totalPages} onChange={setPage} /> : null}
      </div>
    </div>
  );
}

/* --------------------------------- Reviews -------------------------------- */

interface ReviewRow {
  id: string;
  product_name: string;
  product_slug: string;
  email: string;
  author_name: string | null;
  rating: number;
  title: string | null;
  body: string;
  status: string;
  created_at: string;
}

export function AdminReviewsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') ?? '';
  const [removeTarget, setRemoveTarget] = useState<ReviewRow | null>(null);
  const [removing, setRemoving] = useState(false);
  const reviews = useQuery({
    queryKey: ['admin-reviews', status],
    queryFn: () => api<{ reviews: ReviewRow[] }>(`/admin/reviews${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  });

  const moderate = async (id: string, action: 'publish' | 'reject') => {
    if (action === 'reject') setRemoving(true);
    try {
      await api(`/admin/reviews/${id}/moderate`, { method: 'POST', body: { action } });
      toast.push(action === 'publish' ? 'Review published.' : 'Review removed from public view.');
      setRemoveTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Verified purchases only"
        title="Reviews"
        lede="Every review here comes from a delivered order item. There are no seeded testimonials. Removing a review keeps the record for audit."
      />
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <Field label="Status">
          <Select
            value={status}
            onChange={(event) => {
              const params = new URLSearchParams(searchParams);
              if (event.target.value) params.set('status', event.target.value);
              else params.delete('status');
              setSearchParams(params, { replace: true });
            }}
            className="max-w-52"
          >
            <option value="">All statuses</option>
            <option value="published">Published</option>
            <option value="rejected">Removed</option>
          </Select>
        </Field>
        <p className="pb-3 text-[11px] text-muted">{reviews.data?.reviews.length ?? 0} reviews</p>
      </div>
      <div className="mt-5 space-y-3">
        {reviews.isLoading ? <LoadingBlock rows={4} /> : null}
        {reviews.isError ? <ErrorState onRetry={() => void reviews.refetch()} /> : null}
        {reviews.data?.reviews.length ? reviews.data.reviews.map((review) => (
          <section key={review.id} className="border border-line bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-ink">{review.rating} / 5 · {review.title || 'Untitled review'}</p>
                <p className="text-[11px] text-muted">{review.author_name ?? review.email} · <Link to={`/shop/${review.product_slug}`} className="text-forest underline underline-offset-2">{review.product_name}</Link> · {formatDateTime(review.created_at)}</p>
              </div>
              <StatusBadge status={review.status} />
            </div>
            <p className="mt-3 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink/80">{review.body}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {review.status !== 'published' ? <Button size="sm" variant="secondary" onClick={() => void moderate(review.id, 'publish')}>Publish</Button> : null}
              {review.status !== 'rejected' ? <Button size="sm" variant="ghost" onClick={() => setRemoveTarget(review)}>Remove from public view</Button> : null}
            </div>
          </section>
        )) : (
          <EmptyState
            title={status === 'published' ? 'No published reviews' : status === 'rejected' ? 'No removed reviews' : 'No reviews yet'}
            body="Reviews can only be written after an item has been delivered."
          />
        )}
      </div>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove this review?"
        confirmLabel="Remove review"
        loading={removing}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (removeTarget) void moderate(removeTarget.id, 'reject');
        }}
      >
        {removeTarget
          ? `The ${removeTarget.rating}-star review by ${removeTarget.author_name ?? removeTarget.email} will disappear from the public product page. The record is retained for audit and can be published again.`
          : null}
      </ConfirmDialog>
    </div>
  );
}

/* --------------------------------- Content -------------------------------- */

const CONTENT_KEYS = ['announcement', 'homepage', 'about', 'sourcing', 'faq', 'credits', 'policies'] as const;
type ContentKey = (typeof CONTENT_KEYS)[number];

const CONTENT_META: Record<ContentKey, { label: string; description: string }> = {
  announcement: { label: 'Announcement', description: 'The optional strip above the header. Keep claims accurate and dated.' },
  homepage: { label: 'Homepage', description: 'Hero, editorial and gifting copy. Image credits must stay with the image.' },
  about: { label: 'About', description: 'The marketplace story. Do not invent certifications, statistics or partnerships.' },
  sourcing: { label: 'Sourcing', description: 'How products are reviewed. This is an explanation of process, not a certification.' },
  faq: { label: 'FAQ', description: 'Questions and answers shown on the public FAQ page.' },
  credits: { label: 'Credits', description: 'Photography and illustration credits. Keep licence and source links current.' },
  policies: { label: 'Policies', description: 'Draft legal documents. Publish only after review by a qualified adviser.' },
};

export function AdminContentPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [active, setActive] = useState<ContentKey>('announcement');
  const [drafts, setDrafts] = useState<Partial<Record<ContentKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const content = useQuery({
    queryKey: ['admin-content'],
    queryFn: () => api<{ content: SiteContent }>('/admin/content'),
  });
  const storedDraft = content.data ? JSON.stringify(content.data.content[active], null, 2) : '';
  const draft = drafts[active] ?? storedDraft;

  const save = async () => {
    let value: unknown;
    try {
      value = JSON.parse(draft);
    } catch {
      toast.push('This section is not valid JSON. Fix the syntax before saving.', 'error');
      return;
    }
    setSaving(true);
    try {
      await api('/admin/content', { method: 'PUT', body: { key: active, value } });
      toast.push(`${CONTENT_META[active].label} saved.`);
      setDrafts((current) => {
        const next = { ...current };
        delete next[active];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ['admin-content'] });
      await queryClient.invalidateQueries({ queryKey: ['site-content'] });
      await queryClient.invalidateQueries({ queryKey: ['site'] });
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Editorial"
        title="Site content"
        lede="Public copy is edited as structured JSON so nothing is silently invented. Changes publish immediately; policy documents remain marked draft unless their status says published."
      />
      <div className="flex flex-wrap gap-1 border-b border-line">
        {CONTENT_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setActive(key)}
            className={`border-b-2 px-3 py-2.5 text-[12.5px] font-medium ${active === key ? 'border-forest text-forest' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {CONTENT_META[key].label}
          </button>
        ))}
      </div>
      <section className="border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg">{CONTENT_META[active].label}</h2>
            <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-muted">{CONTENT_META[active].description}</p>
          </div>
          <Button loading={saving} onClick={() => void save()}>Save {CONTENT_META[active].label.toLowerCase()}</Button>
        </div>
        {content.isLoading ? <div className="mt-4"><LoadingBlock rows={2} /></div> : null}
        {content.isError ? <div className="mt-4"><ErrorState onRetry={() => void content.refetch()} /></div> : null}
        {content.data ? (
          <Textarea
            className="mt-4 font-mono text-[11.5px] leading-relaxed"
            rows={24}
            spellCheck={false}
            value={draft}
            onChange={(event) => setDrafts((current) => ({ ...current, [active]: event.target.value }))}
            aria-label={`${CONTENT_META[active].label} JSON`}
          />
        ) : null}
        <p className="mt-2 text-[10.5px] text-muted">Saving replaces the whole section. Keep a copy of the previous value if you may need to roll back.</p>
      </section>
    </div>
  );
}

/* --------------------------------- Coupons -------------------------------- */

interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  type: string;
  value: number;
  min_order_paise: number;
  max_discount_paise: number | null;
  usage_limit: number | null;
  per_user_limit: number;
  used_count: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: number;
  created_at: string;
}

export function AdminCouponsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    code: '',
    description: '',
    type: 'percent' as 'percent' | 'fixed',
    value: '',
    minOrder: '',
    maxDiscount: '',
    usageLimit: '',
    perUserLimit: '1',
    startsAt: '',
    endsAt: '',
  });
  const coupons = useQuery({ queryKey: ['admin-coupons'], queryFn: () => api<{ coupons: CouponRow[] }>('/admin/coupons') });

  const create = async (event?: FormEvent) => {
    event?.preventDefault();
    const numeric = Number(form.value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      toast.push('Enter a discount value.', 'error');
      return;
    }
    const value = form.type === 'percent' ? Math.round(numeric) : Math.round(numeric * 100);
    setBusy(true);
    try {
      await api('/admin/coupons', {
        method: 'POST',
        body: {
          code: form.code.trim(),
          description: form.description.trim() || undefined,
          type: form.type,
          value,
          minOrderPaise: form.minOrder ? Math.round(Number(form.minOrder) * 100) : undefined,
          maxDiscountPaise: form.type === 'percent' && form.maxDiscount ? Math.round(Number(form.maxDiscount) * 100) : undefined,
          usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
          perUserLimit: form.perUserLimit ? Number(form.perUserLimit) : undefined,
          startsAt: form.startsAt ? dateInputToIso(form.startsAt) : undefined,
          endsAt: form.endsAt ? dateInputToIso(form.endsAt, true) : undefined,
        },
      });
      toast.push('Coupon created.');
      setOpen(false);
      setForm({ code: '', description: '', type: 'percent', value: '', minOrder: '', maxDiscount: '', usageLimit: '', perUserLimit: '1', startsAt: '', endsAt: '' });
      await queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (coupon: CouponRow) => {
    try {
      await api(`/admin/coupons/${coupon.id}`, { method: 'PATCH', body: { isActive: coupon.is_active !== 1 } });
      toast.push(coupon.is_active ? 'Coupon paused.' : 'Coupon activated.');
      await queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Promotions"
        title="Coupons"
        lede="Discounts are validated again on the server at checkout. A coupon never reduces shipping or tax, and usage limits are enforced transactionally."
        actions={<Button size="sm" onClick={() => setOpen(true)}>Create coupon</Button>}
      />
      <div className="mt-5">
        {coupons.isLoading ? <LoadingBlock rows={4} /> : null}
        {coupons.isError ? <ErrorState onRetry={() => void coupons.refetch()} /> : null}
        {coupons.data?.coupons.length ? (
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="min-w-full text-left text-[12.5px]">
              <thead className="border-b border-line bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
                <tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Discount</th><th className="px-4 py-3">Conditions</th><th className="px-4 py-3">Used</th><th className="px-4 py-3">Window</th><th className="px-4 py-3">State</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {coupons.data.coupons.map((coupon) => (
                  <tr key={coupon.id}>
                    <td className="px-4 py-4"><span className="font-medium text-ink">{coupon.code}</span>{coupon.description ? <p className="text-[10.5px] text-muted">{coupon.description}</p> : null}</td>
                    <td className="px-4 py-4">{coupon.type === 'percent' ? `${coupon.value}%` : formatINR(coupon.value)}{coupon.max_discount_paise ? <p className="text-[10.5px] text-muted">Max {formatINR(coupon.max_discount_paise)}</p> : null}</td>
                    <td className="px-4 py-4 text-muted">{coupon.min_order_paise ? `Min ${formatINR(coupon.min_order_paise)}` : 'No minimum'}<p className="text-[10.5px]">{coupon.per_user_limit} per customer</p></td>
                    <td className="px-4 py-4">{coupon.used_count}{coupon.usage_limit ? ` / ${coupon.usage_limit}` : ''}</td>
                    <td className="px-4 py-4 text-muted">{coupon.starts_at ? formatDate(coupon.starts_at) : 'Any time'}<p className="text-[10.5px]">{coupon.ends_at ? `to ${formatDate(coupon.ends_at)}` : 'No end'}</p></td>
                    <td className="px-4 py-4"><StatusBadge status={coupon.is_active ? 'active' : 'paused'} label={coupon.is_active ? 'Active' : 'Paused'} /></td>
                    <td className="px-4 py-4 text-right"><Button size="sm" variant="ghost" onClick={() => void toggle(coupon)}>{coupon.is_active ? 'Pause' : 'Activate'}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No coupons" body="Create a coupon only when the margin supports it." action={<Button size="sm" onClick={() => setOpen(true)}>Create coupon</Button>} />}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create coupon"
        wide
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} onClick={() => void create()}>Create coupon</Button></>}
      >
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <Field label="Code" required hint="Letters, numbers, - or _"><Input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} required /></Field>
          <Field label="Type"><Select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as 'percent' | 'fixed' })}><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></Select></Field>
          <Field label="Value" required hint={form.type === 'percent' ? 'Percent' : '₹'}><Input inputMode="decimal" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} required /></Field>
          <Field label="Minimum order" hint="₹, optional"><Input inputMode="decimal" value={form.minOrder} onChange={(event) => setForm({ ...form, minOrder: event.target.value })} /></Field>
          {form.type === 'percent' ? <Field label="Maximum discount" hint="₹, optional"><Input inputMode="decimal" value={form.maxDiscount} onChange={(event) => setForm({ ...form, maxDiscount: event.target.value })} /></Field> : null}
          <Field label="Total uses" hint="Optional"><Input inputMode="numeric" value={form.usageLimit} onChange={(event) => setForm({ ...form, usageLimit: event.target.value })} /></Field>
          <Field label="Uses per customer"><Input inputMode="numeric" value={form.perUserLimit} onChange={(event) => setForm({ ...form, perUserLimit: event.target.value })} /></Field>
          <Field label="Starts" hint="Optional"><Input type="date" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></Field>
          <Field label="Ends" hint="Optional"><Input type="date" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></Field>
          <Field label="Description" className="sm:col-span-2"><Input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
          <button type="submit" className="hidden" aria-hidden />
        </form>
      </Modal>
    </div>
  );
}

/* -------------------------------- Campaigns ------------------------------- */

interface AdminCampaignRow extends CampaignSummary {
  storedStatus: 'draft' | 'active' | 'archived';
  isLive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AdminCampaignProduct {
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  basePricePaise: number;
  promoPricePaise: number;
  discountPercent: number;
  stock: number;
  status: string;
  sellerName: string;
  isValid: boolean;
}

interface CampaignCandidate {
  id: string;
  slug: string;
  name: string;
  basePricePaise: number;
  stock: number;
  sellerName: string;
  categoryName: string;
  imageUrl: string | null;
  maxPromoPricePaise: number;
}

const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  active: 'Active',
  expired: 'Expired',
  archived: 'Archived',
};

const emptyCampaignForm = {
  name: '',
  slug: '',
  description: '',
  posterUrl: '',
  posterAlt: '',
  startsAt: '',
  endsAt: '',
  maxDiscountPercent: '30',
  status: 'draft' as AdminCampaignRow['storedStatus'],
};

const rupeesToPaise = (value: string): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
};

function CampaignPriceField({
  initialPaise,
  ariaLabel,
  actionLabel,
  onAction,
  busy,
}: {
  initialPaise: number;
  ariaLabel: string;
  actionLabel: string;
  onAction: (value: string) => void;
  busy: boolean;
}) {
  const [value, setValue] = useState((initialPaise / 100).toFixed(2));
  return (
    <div className="flex items-center gap-1.5">
      <Input
        inputMode="decimal"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="h-8 w-24 px-2 text-xs"
        aria-label={ariaLabel}
      />
      <Button size="sm" variant="secondary" loading={busy} onClick={() => onAction(value)}>
        {actionLabel}
      </Button>
    </div>
  );
}

export function AdminCampaignsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCampaignRow | null>(null);
  const [managing, setManaging] = useState<AdminCampaignRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminCampaignRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyCampaignForm);
  const [candidateQuery, setCandidateQuery] = useState('');
  const deferredCandidateQuery = useDeferredValue(candidateQuery);

  const campaigns = useQuery({
    queryKey: ['admin-campaigns'],
    queryFn: () => api<{ campaigns: AdminCampaignRow[] }>('/admin/campaigns'),
  });

  const campaignProducts = useQuery({
    queryKey: ['admin-campaign-products', managing?.id],
    queryFn: () =>
      api<{ campaign: AdminCampaignRow; products: AdminCampaignProduct[] }>(
        `/admin/campaigns/${managing!.id}/products`,
      ),
    enabled: Boolean(managing),
  });

  const candidates = useQuery({
    queryKey: ['admin-campaign-candidates', managing?.id, deferredCandidateQuery],
    queryFn: () =>
      api<{ candidates: CampaignCandidate[] }>(
        `/admin/campaigns/${managing!.id}/candidates?q=${encodeURIComponent(deferredCandidateQuery)}`,
      ),
    enabled: Boolean(managing),
  });

  const refreshCampaignData = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-campaigns'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-campaign-products'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-campaign-candidates'] });
    await queryClient.invalidateQueries({ queryKey: ['campaign'] });
    await queryClient.invalidateQueries({ queryKey: ['home'] });
    await queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  const payloadFromForm = () => {
    const maxPercent = Number(form.maxDiscountPercent);
    if (!Number.isFinite(maxPercent) || maxPercent < 0 || maxPercent > 100) {
      throw new Error('Enter a maximum discount between 0 and 100%.');
    }
    return {
      name: form.name.trim(),
      slug: form.slug.trim() || undefined,
      description: form.description.trim(),
      posterUrl: form.posterUrl.trim() || undefined,
      posterAlt: form.posterAlt.trim() || undefined,
      startsAt: form.startsAt ? dateInputToIso(form.startsAt) : null,
      endsAt: form.endsAt ? dateInputToIso(form.endsAt, true) : null,
      maxDiscountBp: Math.round(maxPercent * 100),
    };
  };

  const createCampaign = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    try {
      const payload = payloadFromForm();
      if (!payload.name || payload.name.length < 3) throw new Error('Enter a campaign name.');
      await api('/admin/campaigns', { method: 'POST', body: { ...payload, status: form.status } });
      toast.push('Campaign created. Add eligible products before activating it.');
      setCreateOpen(false);
      setForm(emptyCampaignForm);
      await refreshCampaignData();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (campaign: AdminCampaignRow) => {
    setEditing(campaign);
    setForm({
      name: campaign.name,
      slug: campaign.slug,
      description: campaign.description,
      posterUrl: campaign.posterUrl ?? '',
      posterAlt: campaign.posterAlt ?? '',
      startsAt: campaign.startsAt ? campaign.startsAt.slice(0, 10) : '',
      endsAt: campaign.endsAt ? campaign.endsAt.slice(0, 10) : '',
      maxDiscountPercent: String(campaign.maxDiscountBp / 100),
      status: campaign.storedStatus,
    });
  };

  const uploadPoster = async (file: File | null) => {
    if (!file || !editing) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.push('Upload a JPEG, PNG, or WebP poster.', 'error');
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('image', file);
      const result = await api<{ posterUrl: string }>(`/admin/campaigns/${editing.id}/poster`, {
        method: 'POST',
        body,
      });
      setForm((previous) => ({ ...previous, posterUrl: result.posterUrl }));
      toast.push('Poster uploaded.');
      await refreshCampaignData();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveCampaign = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const payload = payloadFromForm();
      await api(`/admin/campaigns/${editing.id}`, {
        method: 'PATCH',
        body: {
          ...payload,
          posterUrl: form.posterUrl.trim() || null,
          posterAlt: form.posterAlt.trim() || null,
          status: form.status,
        },
      });
      toast.push('Campaign updated.');
      setEditing(null);
      await refreshCampaignData();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (campaign: AdminCampaignRow, status: AdminCampaignRow['storedStatus']) => {
    setBusy(true);
    try {
      await api(`/admin/campaigns/${campaign.id}`, { method: 'PATCH', body: { status } });
      toast.push(
        status === 'active'
          ? 'Campaign activated. Prices are now live wherever the window allows.'
          : status === 'archived'
            ? 'Campaign archived. Promotional prices have been withdrawn.'
            : 'Campaign moved back to draft.',
      );
      await refreshCampaignData();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteCampaign = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api(`/admin/campaigns/${deleteTarget.id}`, { method: 'DELETE' });
      toast.push('Draft campaign deleted.');
      setDeleteTarget(null);
      await refreshCampaignData();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const savePromo = async (product: AdminCampaignProduct, value: string) => {
    if (!managing) return;
    const paise = rupeesToPaise(value);
    if (paise === null) {
      toast.push('Enter a promotional price in rupees.', 'error');
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/campaigns/${managing.id}/products/${product.productId}`, {
        method: 'PATCH',
        body: { promoPricePaise: paise },
      });
      toast.push(`Price updated for ${product.name}.`);
      await refreshCampaignData();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const removePromo = async (product: AdminCampaignProduct) => {
    if (!managing) return;
    setBusy(true);
    try {
      await api(`/admin/campaigns/${managing.id}/products/${product.productId}`, { method: 'DELETE' });
      toast.push(`${product.name} removed from the campaign.`);
      await refreshCampaignData();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const addCandidate = async (candidate: CampaignCandidate, value: string) => {
    if (!managing) return;
    const paise = rupeesToPaise(value);
    if (paise === null) {
      toast.push('Enter a promotional price in rupees.', 'error');
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/campaigns/${managing.id}/products`, {
        method: 'POST',
        body: { productId: candidate.id, promoPricePaise: paise },
      });
      toast.push(`${candidate.name} added to the campaign.`);
      setCandidateQuery('');
      await refreshCampaignData();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const managingView = campaignProducts.data?.campaign ?? managing;

  return (
    <div>
      <PageHeader
        eyebrow="Promotions"
        title="Seasonal campaigns"
        lede="Campaigns give explicitly selected products a fixed promotional price. Prices are validated against the current selling price and the campaign cap, and are re-checked by the server for every cart and checkout request."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setForm(emptyCampaignForm);
              setCreateOpen(true);
            }}
          >
            Create campaign
          </Button>
        }
      />

      <div className="mt-5">
        {campaigns.isLoading ? <LoadingBlock rows={4} /> : null}
        {campaigns.isError ? <ErrorState onRetry={() => void campaigns.refetch()} /> : null}
        {campaigns.data?.campaigns.length ? (
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="min-w-full text-left text-[12.5px]">
              <thead className="border-b border-line bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3">Offer</th>
                  <th className="px-4 py-3">Products</th>
                  <th className="px-4 py-3">Window</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {campaigns.data.campaigns.map((campaign) => {
                  const status = campaign.isLive ? 'active' : campaign.status;
                  return (
                    <tr key={campaign.id}>
                      <td className="px-4 py-4">
                        <span className="font-medium text-ink">{campaign.name}</span>
                        <p className="text-[10.5px] text-muted">/offers/{campaign.slug}</p>
                        {campaign.posterUrl ? (
                          <p className="text-[10.5px] text-muted">Poster configured</p>
                        ) : (
                          <p className="text-[10.5px] text-terra">No poster — the homepage banner stays hidden</p>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {campaign.maxDiscountPercent > 0 ? `Up to ${campaign.maxDiscountPercent}%` : 'No live saving'}
                        <p className="text-[10.5px] text-muted">Cap {Math.floor(campaign.maxDiscountBp / 100)}%</p>
                      </td>
                      <td className="px-4 py-4">{campaign.productCount} eligible</td>
                      <td className="px-4 py-4 text-muted">
                        {campaign.startsAt ? formatDate(campaign.startsAt) : 'No start'}
                        <p className="text-[10.5px]">{campaign.endsAt ? `to ${formatDate(campaign.endsAt)}` : 'No end'}</p>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={status} label={CAMPAIGN_STATUS_LABELS[status] ?? status} />
                        {campaign.storedStatus === 'active' && campaign.status === 'scheduled' ? (
                          <p className="mt-1 text-[10.5px] text-muted">Activates automatically</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(campaign)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setManaging(campaign);
                              setCandidateQuery('');
                            }}
                          >
                            Products
                          </Button>
                          {campaign.isLive ? (
                            <LinkButton to={`/offers/${campaign.slug}`} variant="ghost" size="sm">
                              View
                            </LinkButton>
                          ) : null}
                          {campaign.storedStatus === 'active' ? (
                            <Button size="sm" variant="ghost" onClick={() => void setStatus(campaign, 'archived')}>
                              Archive
                            </Button>
                          ) : campaign.storedStatus === 'archived' ? (
                            <Button size="sm" variant="ghost" onClick={() => void setStatus(campaign, 'draft')}>
                              Restore draft
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => void setStatus(campaign, 'active')}>
                              Activate
                            </Button>
                          )}
                          {campaign.storedStatus === 'draft' ? (
                            <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(campaign)}>
                              Delete
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No campaigns"
            body="Create a campaign, then add the products that are genuinely part of the offer. Campaigns never change ordinary product prices."
            action={<Button size="sm" onClick={() => setCreateOpen(true)}>Create campaign</Button>}
          />
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create campaign"
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button loading={busy} onClick={() => void createCampaign()}>Create draft</Button>
          </>
        }
      >
        <form onSubmit={createCampaign} className="grid gap-3 sm:grid-cols-2">
          <Field label="Campaign name" required className="sm:col-span-2">
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </Field>
          <Field label="URL slug" hint="Leave blank to derive from the name">
            <Input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} placeholder="pahadi-festive-glow" />
          </Field>
          <Field label="Maximum discount (%)" required>
            <Input
              inputMode="decimal"
              value={form.maxDiscountPercent}
              onChange={(event) => setForm({ ...form, maxDiscountPercent: event.target.value })}
              required
            />
          </Field>
          <Field label="Starts" hint="Optional; the campaign is scheduled until then">
            <Input type="date" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} />
          </Field>
          <Field label="Ends" hint="Optional; stops selling at the end of this day">
            <Input type="date" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} />
          </Field>
          <Field label="Poster URL" hint="Optional; an uploaded /uploads path or https URL" className="sm:col-span-2">
            <Input value={form.posterUrl} onChange={(event) => setForm({ ...form, posterUrl: event.target.value })} />
          </Field>
          <Field label="Poster alt text" hint="Describe the artwork for screen readers" className="sm:col-span-2">
            <Input value={form.posterAlt} onChange={(event) => setForm({ ...form, posterAlt: event.target.value })} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </Field>
          <p className="text-[11px] leading-relaxed text-muted sm:col-span-2">
            New campaigns start as drafts. Add eligible products and their promotional prices, then activate. The homepage
            banner appears only while an active campaign has a poster and eligible products.
          </p>
          <button type="submit" className="hidden" aria-hidden />
        </form>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit campaign"
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={busy} onClick={() => void saveCampaign()}>Save changes</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Campaign name" required className="sm:col-span-2">
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="URL slug">
            <Input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} />
          </Field>
          <Field label="Maximum discount (%)" required>
            <Input
              inputMode="decimal"
              value={form.maxDiscountPercent}
              onChange={(event) => setForm({ ...form, maxDiscountPercent: event.target.value })}
            />
          </Field>
          <Field label="Starts" hint="Optional">
            <Input type="date" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} />
          </Field>
          <Field label="Ends" hint="Optional">
            <Input type="date" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} />
          </Field>
          <Field label="Editorial status">
            <Select
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value as AdminCampaignRow['storedStatus'] })
              }
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
          <Field label="Poster URL">
            <Input value={form.posterUrl} onChange={(event) => setForm({ ...form, posterUrl: event.target.value })} />
          </Field>
          <Field label="Poster alt text" className="sm:col-span-2">
            <Input value={form.posterAlt} onChange={(event) => setForm({ ...form, posterAlt: event.target.value })} />
          </Field>
          <Field label="Upload poster" hint="JPEG, PNG, or WebP up to 5 MB" className="sm:col-span-2">
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                void uploadPoster(file);
              }}
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </Field>
          {editing ? (
            <p className="text-[11px] leading-relaxed text-muted sm:col-span-2">
              Stored status: {CAMPAIGN_STATUS_LABELS[editing.storedStatus]}. The public state is derived from the window:
              scheduled before the start, expired after the end. Archived campaigns withdraw all promotional prices
              immediately.
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(managing)}
        onClose={() => setManaging(null)}
        title={managingView ? `Products · ${managingView.name}` : 'Campaign products'}
        wide
        footer={<Button variant="ghost" onClick={() => setManaging(null)}>Close</Button>}
      >
        {managingView ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border border-line bg-paper px-3 py-2 text-[11.5px] text-muted">
              <span>
                Cap {Math.floor(managingView.maxDiscountBp / 100)}% · {managingView.productCount} eligible ·{' '}
                {CAMPAIGN_STATUS_LABELS[managingView.status] ?? managingView.status}
              </span>
              {managingView.status !== 'draft' && managingView.status !== 'archived' ? (
                <Link to={`/offers/${managingView.slug}`} className="underline underline-offset-4 hover:text-forest">
                  Open public offer
                </Link>
              ) : null}
            </div>

            {campaignProducts.isLoading ? <LoadingBlock rows={3} /> : null}
            {campaignProducts.isError ? <ErrorState onRetry={() => void campaignProducts.refetch()} /> : null}

            {campaignProducts.data?.products.length ? (
              <div className="overflow-x-auto border border-line">
                <table className="min-w-full text-left text-[12px]">
                  <thead className="border-b border-line bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
                    <tr>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Selling price</th>
                      <th className="px-3 py-2">Promo price (₹)</th>
                      <th className="px-3 py-2">Saving</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {campaignProducts.data.products.map((product) => (
                      <tr key={product.productId}>
                        <td className="px-3 py-3">
                          <p className="font-medium text-ink">{product.name}</p>
                          <p className="text-[10.5px] text-muted">
                            {product.sellerName} · stock {product.stock}
                          </p>
                          {!product.isValid ? (
                            <p className="text-[10.5px] text-terra">Outside the current cap or selling price</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">{formatINR(product.basePricePaise)}</td>
                        <td className="px-3 py-3">
                          <CampaignPriceField
                            key={`${product.productId}:${product.promoPricePaise}`}
                            initialPaise={product.promoPricePaise}
                            ariaLabel={`Promotional price for ${product.name}`}
                            actionLabel="Save"
                            busy={busy}
                            onAction={(value) => void savePromo(product, value)}
                          />
                        </td>
                        <td className="px-3 py-3">
                          {product.discountPercent}%<p className="text-[10.5px] text-muted">{formatINR(product.promoPricePaise)}</p>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="ghost" onClick={() => void removePromo(product)}>
                              Remove
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No eligible products yet"
                body="Search the approved catalogue below and set a promotional price for each product that belongs in this offer."
              />
            )}

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Add an eligible product</p>
              <div className="mt-2">
                <Input
                  value={candidateQuery}
                  onChange={(event) => setCandidateQuery(event.target.value)}
                  placeholder="Search approved products by name, SKU, or maker"
                  aria-label="Search approved products"
                />
              </div>
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                {candidates.isLoading ? <LoadingBlock rows={3} /> : null}
                {candidates.isError ? <ErrorState onRetry={() => void candidates.refetch()} /> : null}
                {candidates.data?.candidates.length ? (
                  candidates.data.candidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="flex flex-col gap-2 border border-line bg-surface px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium text-ink">{candidate.name}</p>
                        <p className="text-[10.5px] text-muted">
                          {candidate.sellerName} · {candidate.categoryName} · {formatINR(candidate.basePricePaise)} · stock{' '}
                          {candidate.stock}
                        </p>
                        <p className="text-[10.5px] text-muted">
                          Lowest allowed price {formatINR(candidate.maxPromoPricePaise)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <CampaignPriceField
                          key={`${candidate.id}:${candidate.maxPromoPricePaise}`}
                          initialPaise={candidate.maxPromoPricePaise}
                          ariaLabel={`Promotional price for ${candidate.name}`}
                          actionLabel="Add"
                          busy={busy}
                          onAction={(value) => void addCandidate(candidate, value)}
                        />
                      </div>
                    </div>
                  ))
                ) : !candidates.isLoading ? (
                  <p className="border border-dashed border-sand bg-surface/60 px-3 py-6 text-center text-xs text-muted">
                    No matching approved products are left to add.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete draft campaign"
        confirmLabel="Delete draft"
        loading={busy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteCampaign()}
      >
        <p>
          Delete “{deleteTarget?.name}” and its product list? Draft campaigns have never been public. Archived campaigns
          are kept for history and cannot be deleted.
        </p>
      </ConfirmDialog>
    </div>
  );
}

/* --------------------------------- Support -------------------------------- */

interface TicketRow {
  id: string;
  email: string;
  name: string;
  subject: string;
  message: string;
  order_number: string | null;
  status: string;
  created_at: string;
}

export function AdminSupportPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') ?? '';
  const tickets = useQuery({
    queryKey: ['admin-support', status],
    queryFn: () => api<{ tickets: TicketRow[] }>(`/admin/support${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  });

  const update = async (ticket: TicketRow, next: string) => {
    try {
      await api(`/admin/support/${ticket.id}`, { method: 'PATCH', body: { status: next } });
      toast.push(`Ticket marked ${humanise(next).toLowerCase()}.`);
      await queryClient.invalidateQueries({ queryKey: ['admin-support'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Customer care"
        title="Support"
        lede="Messages submitted through the public contact form. Replies are sent from your own mail client; this build does not pretend to send from the queue."
      />
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <Field label="Status">
          <Select
            value={status}
            onChange={(event) => {
              const params = new URLSearchParams(searchParams);
              if (event.target.value) params.set('status', event.target.value);
              else params.delete('status');
              setSearchParams(params, { replace: true });
            }}
            className="max-w-52"
          >
            <option value="">All statuses</option>
            {['open', 'in_progress', 'resolved', 'closed'].map((value) => <option key={value} value={value}>{humanise(value)}</option>)}
          </Select>
        </Field>
        <p className="pb-3 text-[11px] text-muted">{tickets.data?.tickets.length ?? 0} tickets</p>
      </div>
      <div className="mt-5 space-y-3">
        {tickets.isLoading ? <LoadingBlock rows={4} /> : null}
        {tickets.isError ? <ErrorState onRetry={() => void tickets.refetch()} /> : null}
        {tickets.data?.tickets.length ? tickets.data.tickets.map((ticket) => {
          const replySubject = encodeURIComponent(`Re: ${ticket.subject}${ticket.order_number ? ` (${ticket.order_number})` : ''}`);
          return (
            <section key={ticket.id} className="border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base">{ticket.subject}</h2>
                  <p className="text-[11px] text-muted">
                    {ticket.name} · {ticket.email}
                    {ticket.order_number ? (
                      <>
                        {' · '}
                        <Link to={`/admin/orders/${encodeURIComponent(ticket.order_number)}`} className="text-forest underline underline-offset-2">
                          {ticket.order_number}
                        </Link>
                      </>
                    ) : null}
                    {' · '}
                    {formatDateTime(ticket.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={ticket.status} label={humanise(ticket.status)} />
                  <Select
                    value={ticket.status}
                    onChange={(event) => void update(ticket, event.target.value)}
                    className="max-w-44"
                    aria-label={`Status for ticket ${ticket.subject}`}
                  >
                    {['open', 'in_progress', 'resolved', 'closed'].map((value) => <option key={value} value={value}>{humanise(value)}</option>)}
                  </Select>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink/80">{ticket.message}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
                <a
                  href={`mailto:${encodeURIComponent(ticket.email)}?subject=${replySubject}`}
                  className="text-forest underline underline-offset-2 hover:text-terra"
                >
                  Reply by email
                </a>
                {ticket.status !== 'closed' ? (
                  <button type="button" onClick={() => void update(ticket, 'closed')} className="text-muted underline underline-offset-2 hover:text-forest">
                    Mark closed
                  </button>
                ) : null}
              </div>
            </section>
          );
        }) : (
          <EmptyState
            title={status === 'open' ? 'No open tickets' : 'No support tickets in this view'}
            body="Messages from the contact form appear here."
          />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- Audit --------------------------------- */

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  created_at: string;
}

export function AdminAuditPage() {
  const [q, setQ] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const logs = useQuery({
    queryKey: ['admin-audit', q, entityType, page],
    queryFn: () => api<{ logs: AuditRow[]; page: number; total: number; totalPages: number }>(`/admin/audit?page=${page}${entityType ? `&entityType=${encodeURIComponent(entityType)}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Accountability"
        title="Audit log"
        lede="Append-only records of administrative and seller actions. Before/after values are retained for sensitive decisions."
      />
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <Field label="Search"><Input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="Action, actor or entity ID" /></Field>
        <Field label="Entity type"><Input value={entityType} onChange={(event) => { setEntityType(event.target.value); setPage(1); }} placeholder="e.g. seller, refund" /></Field>
        <p className="pb-3 text-[11px] text-muted">{logs.data?.total ?? 0} entries</p>
      </div>
      <div className="mt-5">
        {logs.isLoading ? <LoadingBlock rows={4} /> : null}
        {logs.isError ? <ErrorState onRetry={() => void logs.refetch()} /> : null}
        {logs.data?.logs.length ? (
          <div className="space-y-2">
            {logs.data.logs.map((log) => (
              <details key={log.id} className="border border-line bg-surface">
                <summary className="cursor-pointer px-4 py-3 text-[12.5px]">
                  <span className="font-medium text-ink">{log.action}</span>
                  <span className="text-muted"> · {log.entity_type} · {log.actor_email ?? 'system'} · {formatDateTime(log.created_at)}</span>
                </summary>
                <div className="border-t border-line px-4 py-3 text-[11px]">
                  <p className="text-muted">Entity: <span className="break-all text-ink">{log.entity_id}</span></p>
                  <div className="mt-2 grid gap-3 lg:grid-cols-2">
                    <div><p className="mb-1 font-medium text-ink">Before</p><pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words border border-line bg-paper p-2 text-[10.5px] text-muted">{log.before ? JSON.stringify(log.before, null, 2) : '—'}</pre></div>
                    <div><p className="mb-1 font-medium text-ink">After</p><pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words border border-line bg-paper p-2 text-[10.5px] text-muted">{log.after ? JSON.stringify(log.after, null, 2) : '—'}</pre></div>
                  </div>
                </div>
              </details>
            ))}
          </div>
        ) : <EmptyState title="No audit entries in this view" />}
        {logs.data ? <Pagination page={page} totalPages={logs.data.totalPages} onChange={setPage} /> : null}
      </div>
    </div>
  );
}

/* -------------------------------- Settings -------------------------------- */

interface SettingsResponse {
  integrations: {
    payments: { provider: string; configured: boolean; webhookConfigured: boolean; mode: string; devPaymentsEnabled: boolean };
    razorpay: { keyIdConfigured: boolean; keySecretConfigured: boolean; webhookSecretConfigured: boolean };
    email: { configured: boolean; from: string; supportEmail: string };
    shipping: { provider: string; shiprocketConfigured: boolean };
    monitoring: { sentryConfigured: boolean };
  };
  configIssues: string[];
  environment: string;
  policies: Record<string, string>;
  counts: Record<string, number>;
  notifications: { queued?: number; sent?: number; failed?: number; skipped?: number };
  settlementNote: string;
}

export function AdminSettingsPage() {
  const settings = useQuery({ queryKey: ['admin-settings'], queryFn: () => api<SettingsResponse>('/admin/settings') });
  if (settings.isLoading) return <LoadingBlock rows={4} />;
  if (settings.isError || !settings.data) return <ErrorState onRetry={() => void settings.refetch()} />;
  const data = settings.data;
  const payments = data.integrations.payments;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        lede="Read-only view of server configuration. Secrets are never returned to the browser. Anything marked unconfigured is not pretending to work."
      />
      {data.configIssues.length ? (
        <Alert tone="warning" title="Configuration issues">
          <ul className="mt-1 list-disc space-y-1 pl-4">{data.configIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        </Alert>
      ) : (
        <Alert tone="success" title="No blocking configuration issues reported">This does not prove that live payments, email or shipping have been exercised. Test each provider with real sandbox credentials before launch.</Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="border border-line bg-surface p-5">
          <div className="flex items-center justify-between gap-3"><h2 className="text-lg">Payments</h2><Badge tone={payments.configured ? 'forest' : 'terra'}>{payments.configured ? `${payments.mode} mode` : 'Unconfigured'}</Badge></div>
          <dl className="mt-3 space-y-2 text-[12.5px]">
            <div className="flex justify-between gap-3"><dt className="text-muted">Provider</dt><dd>{humanise(payments.provider)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Key ID</dt><dd>{data.integrations.razorpay.keyIdConfigured ? 'Present' : 'Missing'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Key secret</dt><dd>{data.integrations.razorpay.keySecretConfigured ? 'Present' : 'Missing'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Webhook secret</dt><dd>{data.integrations.razorpay.webhookSecretConfigured ? 'Present' : 'Missing'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Development simulator</dt><dd>{payments.devPaymentsEnabled ? 'Enabled (non-production)' : 'Disabled'}</dd></div>
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">To accept money, add Razorpay keys, register the webhook endpoint and complete merchant onboarding. Until then checkout can only be simulated in development.</p>
        </section>

        <section className="border border-line bg-surface p-5">
          <div className="flex items-center justify-between gap-3"><h2 className="text-lg">Email</h2><Badge tone={data.integrations.email.configured ? 'forest' : 'terra'}>{data.integrations.email.configured ? 'Configured' : 'Not configured'}</Badge></div>
          <dl className="mt-3 space-y-2 text-[12.5px]">
            <div className="flex justify-between gap-3"><dt className="text-muted">From</dt><dd className="break-all text-right">{data.integrations.email.from}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Support address</dt><dd className="break-all text-right">{data.integrations.email.supportEmail}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Queue</dt><dd>{data.notifications.sent ?? 0} sent · {data.notifications.skipped ?? 0} skipped · {data.notifications.failed ?? 0} failed</dd></div>
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">Without SMTP, notifications are recorded as skipped rather than falsely reported as sent.</p>
        </section>

        <section className="border border-line bg-surface p-5">
          <div className="flex items-center justify-between gap-3"><h2 className="text-lg">Shipping</h2><Badge tone="sand">{humanise(data.integrations.shipping.provider)}</Badge></div>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">Dispatch is a manual workflow: the operator records a real carrier and tracking number against each seller shipment. Shiprocket credentials are {data.integrations.shipping.shiprocketConfigured ? 'present, but the adapter is not implemented in this build' : 'not configured; the adapter is not implemented in this build'}.</p>
        </section>

        <section className="border border-line bg-surface p-5">
          <div className="flex items-center justify-between gap-3"><h2 className="text-lg">Monitoring</h2><Badge tone={data.integrations.monitoring.sentryConfigured ? 'forest' : 'terra'}>{data.integrations.monitoring.sentryConfigured ? 'DSN present' : 'Not configured'}</Badge></div>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">The application writes structured JSON logs. Error tracking is optional and must be configured at deployment.</p>
          <p className="mt-3 text-[11px] text-muted">Environment: {data.environment}</p>
        </section>
      </div>

      <section className="border border-line bg-surface p-5">
        <h2 className="text-lg">Policy status</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(data.policies).map(([key, status]) => (
            <span key={key} className="inline-flex items-center gap-2 border border-line px-2.5 py-1 text-[11px]">{humanise(key)}<StatusBadge status={status} /></span>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">Draft policies are visible with a draft notice. Publish them only after review by a qualified legal adviser.</p>
      </section>

      <section className="border border-line bg-surface p-5">
        <h2 className="text-lg">Database counts</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-3 lg:grid-cols-6">
          {Object.entries(data.counts).map(([key, value]) => (
            <div key={key} className="border border-line bg-paper p-3"><dt className="text-[10px] uppercase tracking-[0.12em] text-muted">{humanise(key)}</dt><dd className="mt-1 font-serif text-xl text-forest">{value}</dd></div>
          ))}
        </dl>
      </section>

      <Alert tone="info" title="Settlements">{data.settlementNote}</Alert>
    </div>
  );
}
