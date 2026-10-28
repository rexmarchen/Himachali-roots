import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Category, ProductStatus, SellerProduct } from '@shared/types';
import { APPLICATION_STATUS_LABELS, PRODUCT_WORKFLOW_LABELS, STORE_STATUS_LABELS, formatINR } from '@shared/types';
import { COMPLIANCE_GUIDES, complianceGroupFor } from '@shared/productCompliance';
import { api, errorFields, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { usePageMeta } from '@/lib/usePageMeta';
import { useAuth } from '@/lib/session';
import { formatDate, formatDateTime, humanise, percentFromBp, sellerOrderStatusLabel } from '@/lib/format';
import {
  Alert,
  Badge,
  Button,
  DemoBadge,
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

interface SellerApplicationResponse {
  exists: boolean;
  seller?: {
    id: string;
    businessName: string;
    slug: string;
    status: string;
    sellerType: string;
    sellerCategory: string | null;
    storeStatus: string;
    storeStatusReason: string | null;
    payoutStatus: string;
    region: string | null;
    village: string | null;
    tagline: string | null;
    story: string | null;
    logoUrl: string | null;
    coverUrl: string | null;
    operatingAddress: { line1: string; line2?: string; city: string; state: string; pincode: string; phone?: string } | null;
    pickupAddress: Record<string, unknown> | null;
    gstin: string | null;
    panLast4: string | null;
    rejectionReason: string | null;
    onboardingStep: number;
    createdAt: string;
    approvedAt: string | null;
  };
  application?: {
    id: string;
    status: string;
    revision: number;
    currentStep: number;
    businessName: string;
    sellerType: string;
    sellerCategory: string | null;
    categories: string[];
    gstin: string | null;
    phone: string | null;
    notes: string | null;
    data: Record<string, unknown>;
    submittedAt: string | null;
    reviewedAt: string | null;
    rejectionReason: string | null;
    lastSavedAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  documents: {
    id: string;
    docType: string;
    docLabel: string | null;
    originalName: string;
    status: string;
    reviewNote: string | null;
    uploadedAt: string;
  }[];
  events?: {
    id: string;
    event: string;
    fromStatus: string | null;
    toStatus: string | null;
    reason: string | null;
    actorEmail: string | null;
    createdAt: string;
  }[];
  requirements?: { required: string[]; optional: string[]; missing: string[]; labels: Record<string, string> };
  checklist?: { id: string; label: string; status: string; detail: string; href?: string }[];
  verification?: { emailVerified: boolean; phoneVerified: boolean; smsConfigured: boolean };
  payoutProvider?: { configured: boolean; provider: string; message: string };
  commissionNote: string;
}

interface SellerNotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

const EVENT_LABELS: Record<string, string> = {
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

function StudioNavIcon({ type, className = 'h-4 w-4' }: { type: string; className?: string }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };
  switch (type) {
    case 'overview':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>
      );
    case 'products':
      return (
        <svg {...common}>
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      );
    case 'add-product':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      );
    case 'inventory':
      return (
        <svg {...common}>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );
    case 'orders':
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case 'shipping':
      return (
        <svg {...common}>
          <rect x="1" y="3" width="15" height="13" rx="1" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      );
    case 'returns':
      return (
        <svg {...common}>
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      );
    case 'storefront':
      return (
        <svg {...common}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case 'analytics':
      return (
        <svg {...common}>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case 'earnings':
      return (
        <svg {...common}>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      );
    case 'notifications':
      return (
        <svg {...common}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case 'profile':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case 'compliance':
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case 'support':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    default:
      return null;
  }
}

const SELLER_NAV_GROUPS = [
  {
    heading: 'Core',
    items: [
      { label: 'Overview', to: '/seller', icon: 'overview', end: true },
      { label: 'Products', to: '/seller/products', icon: 'products' },
      { label: 'Add Product', to: '/seller/products/new', icon: 'add-product' },
      { label: 'Inventory', to: '/seller/inventory', icon: 'inventory' },
    ],
  },
  {
    heading: 'Fulfilment',
    items: [
      { label: 'Orders', to: '/seller/orders', icon: 'orders' },
      { label: 'Shipping & Tracking', to: '/seller/shipping', icon: 'shipping' },
      { label: 'Returns & Requests', to: '/seller/requests', icon: 'returns' },
    ],
  },
  {
    heading: 'Finances',
    items: [
      { label: 'Analytics', to: '/seller/analytics', icon: 'analytics' },
      { label: 'Payments & Payouts', to: '/seller/earnings', icon: 'earnings' },
    ],
  },
  {
    heading: 'Store & Verification',
    items: [
      { label: 'Public Storefront', to: 'storefront', icon: 'storefront', isStorefront: true },
      { label: 'Notifications', to: '/seller/notifications', icon: 'notifications' },
      { label: 'Store Profile', to: '/seller/profile', icon: 'profile' },
      { label: 'Verification & KYC', to: '/seller/application', icon: 'compliance' },
      { label: 'Help & Support', to: '/contact', icon: 'support' },
    ],
  },
];

function sellerPageTitle(pathname: string) {
  if (pathname === '/seller/products/new') return 'Add a product';
  if (/^\/seller\/products\/[^/]+\/edit$/.test(pathname)) return 'Edit product';
  if (/^\/seller\/orders\/[^/]+$/.test(pathname)) return 'Order details';
  const items = SELLER_NAV_GROUPS.flatMap((group) => group.items);
  const match = items.find(
    (item) => item.to === pathname || (item.to !== '/seller' && pathname.startsWith(`${item.to}/`)),
  );
  return match?.label ?? 'Seller Studio';
}

export function SellerLayout() {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  usePageMeta({ title: `${sellerPageTitle(location.pathname)} · Seller Studio · Dear Hills` });

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const panel = drawerRef.current;
    const trigger = drawerTriggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      panel?.querySelector<HTMLElement>('a, button')?.focus();
    }, 0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileDrawerOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = panel?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
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
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      trigger?.focus();
    };
  }, [mobileDrawerOpen]);

  const application = useQuery({
    queryKey: ['seller-application'],
    queryFn: () => api<SellerApplicationResponse>('/seller/application'),
    retry: false,
  });
  const notifications = useQuery({
    queryKey: ['seller-notifications'],
    queryFn: () => api<{ notifications: SellerNotificationRow[]; unread: number }>('/seller/notifications'),
    retry: false,
  });

  if (application.isLoading) {
    return <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"><LoadingBlock rows={3} /></div>;
  }
  if (application.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <ErrorState title="Seller workspace unavailable" body="The seller application could not be loaded." onRetry={() => void application.refetch()} />
      </div>
    );
  }

  // The route guard only admits an approved seller, so a missing record is a
  // real error rather than a reason to invent a demo workshop.
  const seller = application.data?.seller;
  if (!seller) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <ErrorState
          title="Seller profile not found"
          body="Your account does not have a seller profile yet. Start or resume your application."
          onRetry={() => navigate('/seller/application')}
        />
      </div>
    );
  }

  const unread = notifications.data?.unread ?? 0;

  // Breadcrumb label helper
  const pathname = location.pathname;
  let currentBreadcrumb = 'Studio Overview';
  if (pathname === '/seller/products') currentBreadcrumb = 'Product Catalogue';
  else if (pathname === '/seller/products/new') currentBreadcrumb = 'Add New Product';
  else if (pathname.includes('/products/') && pathname.includes('/edit')) currentBreadcrumb = 'Edit Product';
  else if (pathname === '/seller/inventory') currentBreadcrumb = 'Inventory Stock';
  else if (pathname === '/seller/orders') currentBreadcrumb = 'Order Management';
  else if (pathname.includes('/seller/orders/')) currentBreadcrumb = 'Order Fulfilment';
  else if (pathname === '/seller/shipping') currentBreadcrumb = 'Shipping & Tracking';
  else if (pathname === '/seller/requests') currentBreadcrumb = 'Returns & Cancellations';
  else if (pathname === '/seller/earnings') currentBreadcrumb = 'Payments & Payouts';
  else if (pathname === '/seller/analytics') currentBreadcrumb = 'Sales Analytics';
  else if (pathname === '/seller/notifications') currentBreadcrumb = 'Notifications';
  else if (pathname === '/seller/profile') currentBreadcrumb = 'Store Profile Settings';
  else if (pathname === '/seller/application') currentBreadcrumb = 'Verification & Compliance';

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between overflow-y-auto bg-[#172321] text-[#F7F1E7]">
      <div>
        {/* Studio Branding */}
        <div className="border-b border-white/10 px-6 py-5">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="h-8 w-8 rounded-lg bg-[#D98263] flex items-center justify-center font-serif text-white font-bold text-lg shadow">
              P
            </div>
            <div>
              <p className="font-serif text-lg tracking-wide text-white group-hover:text-[#D98263] transition-colors">DEAR HILLS</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#D98263] font-medium">Maker Studio</p>
            </div>
          </Link>

          {/* Store status chip */}
          <div className="mt-4 rounded-lg bg-white/5 border border-white/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-white truncate">{seller.businessName}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#66745A]/30 px-2 py-0.5 text-[10px] text-[#A3B899] font-medium shrink-0">
                <span className={`h-1.5 w-1.5 rounded-full ${seller.storeStatus === 'active' ? 'bg-[#66745A]' : 'bg-amber-400'}`} />
                {STORE_STATUS_LABELS[seller.storeStatus] ?? humanise(seller.storeStatus)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-white/50">
              {seller.village ? `${seller.village}, ` : ''}{seller.region ?? 'Himachal Pradesh'}
            </p>
          </div>
        </div>

        {/* Navigation Groups */}
        <nav className="space-y-6 px-4 py-5" aria-label="Seller Studio Navigation">
          {SELLER_NAV_GROUPS.map((group) => (
            <div key={group.heading}>
              <p className="px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                {group.heading}
              </p>
              <ul className="mt-1.5 space-y-1">
                {group.items.map((item) => {
                  if ('isStorefront' in item && item.isStorefront) {
                    if (!seller.slug) return null;
                    return (
                      <li key={item.label}>
                        <Link
                          to={`/makers/${seller.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex min-h-11 items-center justify-between rounded-lg px-2.5 py-2 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <StudioNavIcon type={item.icon} className="h-4 w-4 text-[#D98263]" />
                            <span>{item.label}</span>
                          </div>
                          <span className="text-[10px] text-white/40">↗</span>
                        </Link>
                      </li>
                    );
                  }

                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={'end' in item ? item.end : undefined}
                        onClick={() => setMobileDrawerOpen(false)}
                        className={({ isActive }) =>
                          `flex min-h-11 items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors ${
                            isActive
                              ? 'bg-[#D98263] text-white font-medium shadow-sm'
                              : 'text-white/70 hover:bg-white/10 hover:text-white'
                          }`
                        }
                      >
                        <div className="flex items-center gap-2.5">
                          <StudioNavIcon type={item.icon} className="h-4 w-4" />
                          <span>{item.label}</span>
                        </div>
                        {item.to === '/seller/notifications' && unread > 0 ? (
                          <span className="rounded-full bg-[#D98263] px-1.5 py-0.2 text-[10px] font-semibold text-white">
                            {unread}
                          </span>
                        ) : null}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom Profile & Signout */}
      <div className="border-t border-white/10 p-4">
        <Link
          to="/"
          className="flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white transition-colors"
        >
          <span>←</span>
          <span>Customer Marketplace</span>
        </Link>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="mt-2 w-full text-center text-[11px] text-white/40 hover:text-white transition-colors py-1"
        >
          Sign out of studio
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#F7F1E7] text-[#172321]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 z-30 shadow-xl">
        {sidebarContent}
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileDrawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Seller Studio navigation"
            className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-2xl"
          >
            {sidebarContent}
          </div>
        </div>
      ) : null}

      {/* Main Workspace Area */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        {/* Studio Top Navigation Bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#E4DACE] bg-[#F7F1E7]/90 px-4 sm:px-6 lg:px-8 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              ref={drawerTriggerRef}
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#172321] hover:bg-black/5 lg:hidden"
              aria-label="Open sidebar menu"
              aria-expanded={mobileDrawerOpen}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#66745A] font-semibold">DEAR HILLS · Maker Studio</p>
              <h2 className="text-base font-serif text-[#172321]">{currentBreadcrumb}</h2>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to={`/makers/${seller.slug}`}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-[#E4DACE] bg-white px-3 py-1.5 text-xs text-[#172321] hover:bg-[#FAF7F2] transition-colors shadow-sm"
            >
              <span>View Live Store</span>
              <span className="text-[10px] text-[#D98263]">↗</span>
            </Link>

            <Link
              to="/seller/notifications"
              className="relative rounded-lg border border-[#E4DACE] bg-white p-2 text-[#172321] hover:bg-[#FAF7F2] transition-colors"
              title="Notifications"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unread > 0 ? (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#D98263] text-[9px] font-bold text-white shadow">
                  {unread}
                </span>
              ) : null}
            </Link>

            <LinkButton to="/seller/products/new" size="sm" variant="terra" className="shadow-sm">
              + Add Product
            </LinkButton>
          </div>
        </header>

        {/* Content Outlet */}
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}


function applicationStatusLabel(status: string | undefined): string {
  return APPLICATION_STATUS_LABELS[status ?? ''] ?? humanise(status ?? 'draft');
}

export function SellerApplicationPage() {
  const application = useQuery<SellerApplicationResponse>({
    queryKey: ['seller-application'],
    queryFn: () => api<SellerApplicationResponse>('/seller/application'),
    retry: false,
  });

  if (application.isLoading) return <LoadingBlock rows={4} />;
  if (application.isError || !application.data) {
    return <ErrorState onRetry={() => void application.refetch()} />;
  }
  if (!application.data.exists || !application.data.seller) {
    return (
      <EmptyState
        title="No application yet"
        body="Start a maker application and it will appear here with its status, documents and review history."
        action={<LinkButton to="/sell">Start an application</LinkButton>}
      />
    );
  }

  const data = application.data;
  const seller = data.seller!;
  const app = data.application;
  const status = app?.status ?? seller.status;
  const canEdit = ['draft', 'changes_requested', 'rejected'].includes(status);
  const requirements = data.requirements;
  const events = data.events ?? [];
  const checklist = data.checklist ?? [];

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Application & verification"
        title={seller.businessName}
        lede="This is the canonical record of your maker application. Reviewer notes, document decisions and status history stay here."
        actions={<StatusBadge status={status} label={applicationStatusLabel(status)} />}
      />

      {status === 'draft' ? (
        <Alert tone="info" title="Draft not submitted">
          Your application is saved but has not reached the review team.{' '}
          <Link to="/sell?edit=1&step=10" className="underline underline-offset-2">Review and submit it</Link> when it is ready.
        </Alert>
      ) : null}
      {status === 'changes_requested' ? (
        <Alert tone="warning" title="Changes requested">
          <p>{app?.rejectionReason ?? 'The review team has asked for changes. Open the application form to see the affected sections.'}</p>
          <div className="mt-3">
            <LinkButton to="/sell?edit=1&step=1" size="sm">Revise application</LinkButton>
          </div>
        </Alert>
      ) : null}
      {status === 'rejected' ? (
        <Alert tone="error" title="Application not approved">
          <p>{app?.rejectionReason ?? 'The review team could not approve this application.'}</p>
          <div className="mt-3">
            <LinkButton to="/sell?edit=1&step=1" size="sm" variant="secondary">Revise and resubmit</LinkButton>
          </div>
        </Alert>
      ) : null}
      {status === 'suspended' ? (
        <Alert tone="error" title="Store suspended">
          <p>{seller.storeStatusReason ?? app?.rejectionReason ?? 'Your store is suspended. Contact support before making changes.'}</p>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="border border-line bg-surface p-4">
          <p className="eyebrow">Application</p>
          <p className="mt-2 text-sm text-ink">{applicationStatusLabel(status)}</p>
          <p className="mt-1 text-[11px] text-muted">Revision {app?.revision ?? 1}{app?.submittedAt ? ` · submitted ${formatDate(app.submittedAt)}` : ''}</p>
        </div>
        <div className="border border-line bg-surface p-4">
          <p className="eyebrow">Store</p>
          <p className="mt-2 text-sm text-ink">{STORE_STATUS_LABELS[seller.storeStatus] ?? humanise(seller.storeStatus)}</p>
          <p className="mt-1 text-[11px] text-muted">{seller.sellerCategory ? humanise(seller.sellerCategory) : 'Category not set'}</p>
        </div>
        <div className="border border-line bg-surface p-4">
          <p className="eyebrow">Payouts</p>
          <p className="mt-2 text-sm text-ink">{humanise(seller.payoutStatus)}</p>
          <p className="mt-1 text-[11px] text-muted">Manual review until a payout provider is configured.</p>
        </div>
      </div>

      {requirements?.missing.length ? (
        <Alert tone="warning" title="Evidence still required">
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {requirements.missing.map((type) => (
              <li key={type}>{requirements.labels[type] ?? type}</li>
            ))}
          </ul>
          <div className="mt-3">
            <LinkButton to="/sell?edit=1&step=6" size="sm">Open documents</LinkButton>
          </div>
        </Alert>
      ) : null}

      {checklist.length ? (
        <section className="border border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-lg">Onboarding checklist</h2>
            <p className="mt-1 text-[11px] text-muted">Derived from your saved application and documents — not a promise of approval.</p>
          </div>
          <ul className="divide-y divide-line">
            {checklist.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
                <div>
                  <p className="text-[13px] text-ink">{item.label}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{item.detail}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-[10.5px] uppercase tracking-[0.1em] ${
                      item.status === 'complete' ? 'text-forest' : item.status === 'action' ? 'text-[#8e4630]' : 'text-muted'
                    }`}
                  >
                    {item.status === 'complete' ? 'Complete' : item.status === 'action' ? 'Action needed' : 'Pending'}
                  </span>
                  {item.href && canEdit ? (
                    <Link to={item.href} className="text-[11px] text-forest underline underline-offset-2">Open</Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-lg">Verification documents</h2>
          <p className="mt-1 text-[11px] text-muted">Private files are visible only to authorised reviewers. They are never published.</p>
        </div>
        {data.documents.length ? (
          <ul className="divide-y divide-line">
            {data.documents.map((document) => (
              <li key={document.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-[13px] text-ink">{document.docLabel ?? humanise(document.docType)}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted">
                    {document.originalName} · uploaded {formatDate(document.uploadedAt)}
                  </p>
                  {document.reviewNote ? <p className="mt-1 text-[11px] text-[#8e4630]">Reviewer: {document.reviewNote}</p> : null}
                </div>
                <Badge tone={document.status === 'accepted' ? 'forest' : document.status === 'rejected' ? 'terra' : 'sand'}>
                  {document.status === 'accepted' ? 'Accepted' : document.status === 'rejected' ? 'Rejected' : 'Awaiting review'}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-muted">No documents uploaded yet.</p>
        )}
        <div className="border-t border-line px-5 py-3">
          <Link to="/sell?edit=1&step=6" className="text-[11px] text-forest underline underline-offset-2">Manage documents in the application form</Link>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border border-line bg-surface">
          <div className="border-b border-line px-5 py-4"><h2 className="text-lg">Status history</h2></div>
          {events.length ? (
            <ol className="space-y-4 px-5 py-4">
              {events.map((event) => (
                <li key={event.id} className="border-l border-line pl-3">
                  <p className="text-[13px] text-ink">{EVENT_LABELS[event.event] ?? humanise(event.event)}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {formatDateTime(event.createdAt)}
                    {event.toStatus ? ` · ${applicationStatusLabel(event.toStatus)}` : ''}
                  </p>
                  {event.reason ? <p className="mt-1 text-[11.5px] text-bark">{event.reason}</p> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted">No recorded events yet.</p>
          )}
        </section>
        <section className="space-y-4">
          <div className="border border-line bg-surface p-5">
            <h2 className="text-lg">Account verification</h2>
            <dl className="mt-3 space-y-2 text-[12.5px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Email</dt>
                <dd className={data.verification?.emailVerified ? 'text-forest' : 'text-[#8e4630]'}>
                  {data.verification?.emailVerified ? 'Confirmed' : 'Not confirmed'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Mobile</dt>
                <dd className="text-bark">
                  {data.verification?.phoneVerified ? 'Verified' : 'Verified manually during review (SMS not configured)'}
                </dd>
              </div>
            </dl>
          </div>
          <div className="border border-line bg-paper p-5 text-[11.5px] leading-relaxed text-muted">
            <p className="font-medium text-ink">Commission</p>
            <p className="mt-1">{data.commissionNote}</p>
            <p className="mt-2">{data.payoutProvider?.message ?? 'Payouts are settled manually after review; no provider is connected in this environment.'}</p>
          </div>
        </section>
      </div>
    </div>
  );
}

interface InventoryItem {
  productId: string;
  name: string;
  sku: string;
  status: string;
  pricePaise: number;
  quantity: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  updatedAt: string;
}

function InventoryLine({ item }: { item: InventoryItem }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [threshold, setThreshold] = useState(String(item.lowStockThreshold));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = Number(quantity);
    if (!Number.isInteger(parsed) || parsed < 0) {
      toast.push('Enter a whole number for stock.', 'error');
      return;
    }
    setSaving(true);
    try {
      await api(`/seller/inventory/${item.productId}`, {
        method: 'POST',
        body: {
          quantity: parsed,
          lowStockThreshold: threshold === '' ? undefined : Number(threshold),
          note: note || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['seller-inventory'] });
      await queryClient.invalidateQueries({ queryKey: ['seller-products'] });
      setNote('');
      toast.push('Stock updated.');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="align-top">
      <td className="px-4 py-4">
        <Link to={`/seller/products/${item.productId}/edit`} className="text-[13px] font-medium text-forest hover:text-terra">{item.name}</Link>
        <p className="mt-0.5 text-[10.5px] text-muted">{item.sku} · {PRODUCT_WORKFLOW_LABELS[item.status] ?? humanise(item.status)}</p>
      </td>
      <td className="px-4 py-4 text-[12.5px]">
        <p>{item.available} available</p>
        <p className="text-[10.5px] text-muted">{item.reserved} reserved · {item.quantity} on hand</p>
      </td>
      <td className="px-4 py-4 text-[12.5px]">{formatINR(item.pricePaise)}</td>
      <td className="px-4 py-4">
        <form onSubmit={save} className="flex flex-wrap items-end gap-2">
          <label className="text-[10px] uppercase tracking-[0.1em] text-muted">
            On hand
            <Input
              value={quantity}
              inputMode="numeric"
              className="mt-1 w-20"
              onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ''))}
              aria-label={`Stock on hand for ${item.name}`}
            />
          </label>
          <label className="text-[10px] uppercase tracking-[0.1em] text-muted">
            Alert at
            <Input
              value={threshold}
              inputMode="numeric"
              className="mt-1 w-20"
              onChange={(event) => setThreshold(event.target.value.replace(/\D/g, ''))}
              aria-label={`Low stock threshold for ${item.name}`}
            />
          </label>
          <label className="text-[10px] uppercase tracking-[0.1em] text-muted">
            Note
            <Input
              value={note}
              className="mt-1 w-36"
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional"
              aria-label={`Stock note for ${item.name}`}
            />
          </label>
          <Button type="submit" size="sm" variant="secondary" loading={saving}>Update</Button>
        </form>
        <p className="mt-1 text-[10px] text-muted">Updated {formatDate(item.updatedAt)}</p>
      </td>
    </tr>
  );
}

export function SellerInventoryPage() {
  const inventory = useQuery({
    queryKey: ['seller-inventory'],
    queryFn: () => api<{ inventory: InventoryItem[] }>('/seller/inventory'),
  });

  if (inventory.isLoading) return <LoadingBlock rows={4} />;
  if (inventory.isError) return <ErrorState onRetry={() => void inventory.refetch()} />;

  const items = inventory.data?.inventory ?? [];
  const low = items.filter((item) => item.available <= item.lowStockThreshold).length;

  return (
    <div>
      <PageHeader
        eyebrow="Inventory"
        title="Stock on hand"
        lede="Stock is reserved when an order is paid. You cannot reduce on-hand stock below the reserved quantity."
        actions={<LinkButton to="/seller/products" variant="secondary">Back to products</LinkButton>}
      />
      {low ? (
        <div className="mt-5"><Alert tone="warning" title={`${low} listing${low === 1 ? '' : 's'} at or below the low-stock threshold`}>Restock before new orders arrive, or pause the listing.</Alert></div>
      ) : null}
      <div className="mt-6 overflow-x-auto border border-line bg-surface">
        {items.length ? (
          <table className="min-w-full text-left text-[12.5px]">
            <thead className="border-b border-line bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Availability</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Adjust stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((item) => <InventoryLine key={item.productId} item={item} />)}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No inventory yet" body="Create a product draft; an inventory record is created automatically." action={<LinkButton to="/seller/products/new">Add a product</LinkButton>} />
        )}
      </div>
    </div>
  );
}

export function SellerNotificationsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ['seller-notifications'],
    queryFn: () => api<{ notifications: SellerNotificationRow[]; unread: number }>('/seller/notifications'),
  });
  const [busy, setBusy] = useState<string | null>(null);

  const markRead = async (id: string) => {
    setBusy(id);
    try {
      await api(`/seller/notifications/${id}/read`, { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['seller-notifications'] });
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(null);
    }
  };

  const markAll = async () => {
    setBusy('all');
    try {
      await api('/seller/notifications/read-all', { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['seller-notifications'] });
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (notifications.isLoading) return <LoadingBlock rows={3} />;
  if (notifications.isError) return <ErrorState onRetry={() => void notifications.refetch()} />;

  const rows = notifications.data?.notifications ?? [];
  const unread = notifications.data?.unread ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow="Notifications"
        title="Application and store updates"
        lede="Status changes, reviewer notes and document decisions are recorded here. Email delivery depends on the configured mail provider."
        actions={unread ? <Button variant="secondary" size="sm" loading={busy === 'all'} onClick={() => void markAll()}>Mark all read</Button> : undefined}
      />
      {rows.length ? (
        <ul className="mt-6 divide-y divide-line border border-line bg-surface">
          {rows.map((row) => (
            <li key={row.id} className={`px-5 py-4 ${row.readAt ? '' : 'bg-butter/25'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    {!row.readAt ? <span className="h-1.5 w-1.5 rounded-full bg-orchard" aria-label="Unread" /> : null}
                    <p className="text-[13px] font-medium text-ink">{row.title}</p>
                    <span className="text-[10.5px] text-muted">{formatDateTime(row.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{row.body}</p>
                  {row.actionUrl ? (
                    <Link to={row.actionUrl} className="mt-2 inline-block text-[11px] text-forest underline underline-offset-2">Open</Link>
                  ) : null}
                </div>
                {!row.readAt ? (
                  <Button size="sm" variant="ghost" loading={busy === row.id} onClick={() => void markRead(row.id)}>Mark read</Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState title="No notifications yet" body="Updates about your application, documents and store will appear here." />
        </div>
      )}
    </div>
  );
}

interface DashboardResponse {
  store: { status: string; payoutStatus: string; sellerCategory: string | null; statusReason: string | null };
  identity?: {
    businessName: string | null;
    slug: string | null;
    region: string | null;
    village: string | null;
    tagline: string | null;
    story: string | null;
    logoUrl: string | null;
    coverUrl: string | null;
    commissionRateBp: number | null;
  };
  application: { id: string; status: string; revision: number; submittedAt: string | null; reviewedAt: string | null; rejectionReason: string | null } | null;
  checklist: { id: string; label: string; status: string; detail: string; href?: string }[];
  products: { active: number; pending: number; low_stock: number; drafts: number };
  orders: { pending: number; confirmed: number; packed: number; shipped: number; delivered: number; cancelled: number };
  period: { days: number; since: string };
  sales: { gross: number; commission: number; earnings: number; orders: number };
  finances?: {
    grossPaise: number;
    commissionPaise: number;
    netRevenuePaise: number;
    cogsPaise: number;
    packagingPaise: number;
    estimatedProfitPaise: number;
    profitMarginPercent: number;
    hasCostData: boolean;
  };
  costs?: {
    cogsPaise: number;
    packagingPaise: number;
    totalCostPaise: number;
    estimatedProfitPaise: number;
    hasCostData: boolean;
  };
  series?: { date: string; label: string; grossPaise: number; orders: number }[];
  topProducts?: { id: string; name: string; slug: string; unitsSold: number; revenuePaise: number; costPaise?: number; profitPaise?: number }[];
  ledger: { pending: number; eligible: number; settled: number; refunds: number };
  settlement: { pending_batches: number; paid_total: number };
  recentOrders: { id: string; reference: string; orderNumber: string; status: string; totalPaise: number; earningPaise: number; dispatchBy: string | null }[];
  commissionNote: string;
}

export function SellerDashboardPage() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const dashboard = useQuery({
    queryKey: ['seller-dashboard', days],
    queryFn: () => api<DashboardResponse>(`/seller/dashboard?days=${days}`),
  });

  if (dashboard.isLoading) return <LoadingBlock rows={5} />;
  if (dashboard.isError || !dashboard.data) {
    return <ErrorState onRetry={() => void dashboard.refetch()} />;
  }

  const data = dashboard.data;
  const series = data.series ?? [];
  const topProducts = data.topProducts ?? [];

  // SVG Chart Calculations
  const chartW = 760;
  const chartH = 210;
  const padLeft = 60;
  const padRight = 25;
  const padTop = 25;
  const padBottom = 35;
  const plotW = chartW - padLeft - padRight;
  const plotH = chartH - padTop - padBottom;

  const maxGross = Math.max(...series.map((s) => s.grossPaise), 100000);
  const points = series.map((s, idx) => {
    const x = padLeft + (idx / Math.max(series.length - 1, 1)) * plotW;
    const y = padTop + (1 - s.grossPaise / maxGross) * plotH;
    return { x, y, ...s };
  });

  const linePath = points.length > 1
    ? points.reduce((acc, curr, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`, '')
    : '';

  const areaPath = points.length > 1
    ? `${linePath} L ${points[points.length - 1].x.toFixed(1)},${(padTop + plotH).toFixed(1)} L ${points[0].x.toFixed(1)},${(padTop + plotH).toFixed(1)} Z`
    : '';

  // Select evenly spaced tick marks for dates
  const tickStep = Math.max(1, Math.floor(series.length / 6));
  const tickIndices = series.map((_, i) => i).filter((i) => i % tickStep === 0 || i === series.length - 1);

  const hoveredData = hoveredIdx !== null && points[hoveredIdx] ? points[hoveredIdx] : null;

  return (
    <div className="space-y-8">
      {/* Studio Header with Action Buttons & Timeframe Filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#E4DACE] pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              data.store.status === 'active'
                ? 'bg-[#66745A]/15 text-[#66745A]'
                : 'bg-amber-100 text-amber-800'
            }`}>
              <span className={`h-2 w-2 rounded-full ${data.store.status === 'active' ? 'bg-[#66745A]' : 'bg-amber-500'}`} />
              {STORE_STATUS_LABELS[data.store.status] ?? humanise(data.store.status)}
            </span>
            <span className="text-xs text-[#172321]/40">·</span>
            <span className="text-xs text-[#172321]/60">
              {[data.identity?.village, data.identity?.region].filter(Boolean).join(', ') || 'Location not set'}
            </span>
          </div>
          <h1 className="mt-1.5 font-serif text-2xl sm:text-3xl text-[#172321]">
            Namaste, {data.identity?.businessName ?? 'Maker'}
          </h1>
          <p className="mt-1 text-xs text-[#172321]/70">
            Sales, fulfilment and settlement figures below come from paid marketplace orders for the selected period.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Timeframe Selector Pills */}
          <div className="inline-flex rounded-lg border border-[#E4DACE] bg-white p-1 shadow-sm">
            {([7, 30, 90] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDays(t)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  days === t
                    ? 'bg-[#172321] text-white shadow-xs'
                    : 'text-[#172321]/70 hover:text-[#172321] hover:bg-[#FAF7F2]'
                }`}
              >
                {t === 7 ? '7 Days' : t === 30 ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>

          <LinkButton to="/seller/products/new" variant="terra" size="sm">
            + Add Product
          </LinkButton>
        </div>
      </div>

      {/* Action Center - Prioritized Operational Tasks */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.orders.pending > 0 ? (
          <div className="rounded-xl border border-[#D98263]/30 bg-[#FAF3EF] p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#D98263] uppercase tracking-wider">
                  <span className="h-2 w-2 rounded-full bg-[#D98263] animate-ping" />
                  Fulfilment Action
                </span>
                <span className="rounded-full bg-[#D98263] text-white px-2 py-0.5 text-xs font-bold">
                  {data.orders.pending} pending
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-[#172321]">
                Orders Awaiting Confirmation
              </p>
              <p className="mt-1 text-xs text-[#172321]/70">
                Review each order against available stock and record dispatch when it leaves your workshop.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#D98263]/20">
              <Link
                to="/seller/orders?status=pending"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#D98263] hover:underline"
              >
                <span>Process Orders</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[#E4DACE] bg-white p-4 flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#66745A]">Fulfilment Status</span>
              <p className="mt-2 text-sm font-semibold text-[#172321]">All Orders Up To Date</p>
              <p className="mt-1 text-xs text-[#172321]/70">No pending orders awaiting workshop confirmation.</p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#E4DACE]">
              <Link to="/seller/orders" className="text-xs font-medium text-[#66745A] hover:underline">
                View order archive →
              </Link>
            </div>
          </div>
        )}

        {data.products.low_stock > 0 ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Catalogue Health</span>
                <span className="rounded-full bg-amber-600 text-white px-2 py-0.5 text-xs font-bold">
                  {data.products.low_stock} low
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-[#172321]">
                Low Stock Threshold Warning
              </p>
              <p className="mt-1 text-xs text-[#172321]/70">
                Listings near threshold risk automated out-of-stock badge in marketplace search.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-amber-200">
              <Link to="/seller/inventory" className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 hover:underline">
                <span>Restock Inventory</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[#E4DACE] bg-white p-4 flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#66745A]">Stock Health</span>
              <p className="mt-2 text-sm font-semibold text-[#172321]">Inventory Optimal</p>
              <p className="mt-1 text-xs text-[#172321]/70">All active listings have healthy buffer stocks.</p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#E4DACE]">
              <Link to="/seller/inventory" className="text-xs font-medium text-[#66745A] hover:underline">
                Audit quantities →
              </Link>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-[#E4DACE] bg-white p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#172321]/60">Verification status</span>
              <StatusBadge
                status={data.application?.status ?? 'not_submitted'}
                label={
                  data.application
                    ? APPLICATION_STATUS_LABELS[data.application.status as keyof typeof APPLICATION_STATUS_LABELS] ?? humanise(data.application.status)
                    : 'Not submitted'
                }
              />
            </div>
            <p className="mt-2 text-sm font-semibold text-[#172321]">
              {data.application?.status === 'approved'
                ? 'Seller application approved'
                : data.application?.status === 'changes_requested'
                  ? 'Changes requested by admin'
                  : data.application?.status === 'rejected'
                    ? 'Seller application rejected'
                    : data.application?.status === 'suspended'
                      ? 'Store suspended'
                      : data.application
                        ? 'Application under review'
                        : 'Application not submitted'}
            </p>
            <p className="mt-1 text-xs text-[#172321]/70">
              {data.checklist.filter((item) => item.status === 'complete').length} of {data.checklist.length} onboarding checks complete.
              Payouts: {humanise(data.store.payoutStatus)}.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-[#E4DACE]">
            <Link to="/seller/application" className="text-xs font-medium text-[#172321] hover:underline">
              Review verification records →
            </Link>
          </div>
        </div>
      </div>

      {/* Primary KPI Stats Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-[#E4DACE] bg-white p-5 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#172321]/50">Gross Product Sales</p>
          <p className="mt-2 font-serif text-2xl sm:text-3xl text-[#172321]">{formatINR(data.finances?.grossPaise ?? data.sales.gross)}</p>
          <p className="mt-1.5 text-xs text-[#172321]/60">Buyer checkout value ({days} days)</p>
        </div>

        <div className="rounded-xl border border-[#E4DACE] bg-white p-5 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#172321]/50">Marketplace Commission</p>
          <p className="mt-2 font-serif text-2xl sm:text-3xl text-[#172321]/80">−{formatINR(data.finances?.commissionPaise ?? data.sales.commission)}</p>
          <p className="mt-1.5 text-xs text-[#172321]/60">On product value after discounts</p>
        </div>

        <div className="rounded-xl border border-[#D98263]/30 bg-[#FAF3EF] p-5 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#D98263]">Net Maker Earnings</p>
          <p className="mt-2 font-serif text-2xl sm:text-3xl text-[#D98263] font-bold">{formatINR(data.finances?.netRevenuePaise ?? data.sales.earnings)}</p>
          <p className="mt-1.5 text-xs text-[#172321]/70">Authoritative net settlement value</p>
        </div>

        <div className="rounded-xl border border-[#E4DACE] bg-white p-5 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#172321]/50">Paid Order Volume</p>
          <p className="mt-2 font-serif text-2xl sm:text-3xl text-[#172321]">{data.sales.orders}</p>
          <p className="mt-1.5 text-xs text-[#172321]/60">
            {data.orders.shipped + data.orders.delivered} dispatched · {data.orders.pending} pending
          </p>
        </div>
      </div>

      {/* Production Costs & Estimated Profit Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-[#E4DACE] bg-[#FAF7F2] p-4 shadow-xs">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#172321]/50">Product Costs (COGS)</p>
          <p className="mt-1.5 font-serif text-xl sm:text-2xl text-[#172321]">
            {data.finances?.hasCostData ? `−${formatINR(data.finances.cogsPaise)}` : '—'}
          </p>
          <p className="mt-1 text-[11px] text-[#172321]/60">
            {data.finances?.hasCostData ? 'Private maker production costs' : 'Set unit cost in product editor'}
          </p>
        </div>

        <div className="rounded-xl border border-[#E4DACE] bg-[#FAF7F2] p-4 shadow-xs">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#172321]/50">Packaging Expenses</p>
          <p className="mt-1.5 font-serif text-xl sm:text-2xl text-[#172321]">
            {data.finances?.hasCostData ? `−${formatINR(data.finances.packagingPaise)}` : '—'}
          </p>
          <p className="mt-1 text-[11px] text-[#172321]/60">Boxes, wrapping & transit seals</p>
        </div>

        <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 shadow-xs">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-800">Estimated Net Profit</p>
          <p className="mt-1.5 font-serif text-xl sm:text-2xl text-emerald-900 font-bold">
            {data.finances?.hasCostData ? formatINR(data.finances.estimatedProfitPaise) : '—'}
          </p>
          <p className="mt-1 text-[11px] text-emerald-700">
            {data.finances?.hasCostData ? 'Net earnings minus direct costs' : 'Add unit costs to estimate'}
          </p>
        </div>

        <div className="rounded-xl border border-[#66745A]/30 bg-white p-4 shadow-xs">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#66745A]">Profit Margin</p>
          <p className="mt-1.5 font-serif text-xl sm:text-2xl text-[#172321]">
            {data.finances?.hasCostData ? `${data.finances.profitMarginPercent}%` : '—'}
          </p>
          <p className="mt-1 text-[11px] text-[#172321]/60">
            {data.finances?.hasCostData ? 'Net profit / gross sales' : 'Requires product costs'}
          </p>
        </div>
      </div>

      {/* Interactive Sales & Velocity Chart Section */}
      <section className="rounded-xl border border-[#E4DACE] bg-white p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E4DACE] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#D98263]" />
              <h2 className="text-base font-serif font-bold text-[#172321]">
                Sales & Fulfilment Velocity
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-[#172321]/60">
              Interactive revenue trajectory across the last {days} calendar days. Hover data points for daily breakdown.
            </p>
          </div>

          {hoveredData ? (
            <div className="inline-flex items-center gap-3 rounded-lg bg-[#172321] text-white px-3.5 py-1.5 text-xs shadow-md">
              <span className="font-semibold text-[#D98263]">{hoveredData.label}:</span>
              <span>{formatINR(hoveredData.grossPaise)}</span>
              <span className="text-white/60">({hoveredData.orders} order{hoveredData.orders === 1 ? '' : 's'})</span>
            </div>
          ) : (
            <div className="text-xs text-[#172321]/50">
              Showing total {series.length} data points
            </div>
          )}
        </div>

        {/* SVG Area Chart */}
        <div className="mt-5 w-full overflow-x-auto">
          <div className="min-w-[620px]">
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-auto overflow-visible" aria-label="Sales revenue area chart">
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D98263" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#D98263" stopOpacity="0.01" />
                </linearGradient>
              </defs>

              {/* Grid Lines & Y-Axis Labels */}
              {[1, 0.5, 0].map((ratio) => {
                const y = padTop + (1 - ratio) * plotH;
                const val = Math.round(maxGross * ratio);
                return (
                  <g key={ratio}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={padLeft + plotW}
                      y2={y}
                      stroke="#E4DACE"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={padLeft - 10}
                      y={y + 3.5}
                      textAnchor="end"
                      fontSize="9.5"
                      fill="#8F877C"
                      fontFamily="sans-serif"
                    >
                      {formatINR(val)}
                    </text>
                  </g>
                );
              })}

              {/* Area & Line */}
              {areaPath ? <path d={areaPath} fill="url(#areaGradient)" /> : null}
              {linePath ? (
                <path
                  d={linePath}
                  fill="none"
                  stroke="#D98263"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}

              {/* Hover Cursor Vertical Line */}
              {hoveredData ? (
                <line
                  x1={hoveredData.x}
                  y1={padTop}
                  x2={hoveredData.x}
                  y2={padTop + plotH}
                  stroke="#172321"
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                />
              ) : null}

              {/* Interactive Data Points and Invisible Hitboxes */}
              {points.map((pt, i) => (
                <g key={pt.date}>
                  {hoveredIdx === i ? (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="5.5"
                      fill="#D98263"
                      stroke="#FFFFFF"
                      strokeWidth="2.5"
                      className="transition-all"
                    />
                  ) : null}
                  <rect
                    x={pt.x - plotW / (series.length * 2)}
                    y={padTop}
                    width={plotW / series.length}
                    height={plotH}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  />
                </g>
              ))}

              {/* X-Axis Date Ticks */}
              {tickIndices.map((i) => {
                const pt = points[i];
                if (!pt) return null;
                return (
                  <text
                    key={pt.date}
                    x={pt.x}
                    y={chartH - 8}
                    textAnchor="middle"
                    fontSize="9.5"
                    fill="#8F877C"
                    fontFamily="sans-serif"
                  >
                    {pt.label}
                  </text>
                );
              })}
            </svg>
          </div>
        </div>
      </section>

      {/* Two-Column Grid: Orders & Products vs Ledger & Readiness */}
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          {/* Top Selling Products in Period */}
          <section className="rounded-xl border border-[#E4DACE] bg-white overflow-hidden shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E4DACE] px-5 py-4">
              <div>
                <h2 className="text-sm font-serif font-bold text-[#172321]">Top Performing Creations</h2>
                <p className="text-[11px] text-[#172321]/60">Ranked by revenue generated during this {days}-day period</p>
              </div>
              <Link to="/seller/products" className="text-xs text-[#D98263] font-medium hover:underline">
                All Listings →
              </Link>
            </div>
            {topProducts.length ? (
              <div className="divide-y divide-[#E4DACE]">
                {topProducts.map((p, idx) => (
                  <div key={p.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-[#FAF7F2] transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#172321]/5 text-xs font-bold text-[#172321]">
                        #{idx + 1}
                      </span>
                      <div>
                        <p className="text-xs font-medium text-[#172321]">{p.name}</p>
                        <p className="text-[10.5px] text-[#172321]/55">{p.unitsSold} units sold</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-[#172321]">{formatINR(p.revenuePaise)}</p>
                      {p.profitPaise !== undefined && p.profitPaise > 0 ? (
                        <p className="text-[10px] text-[#D98263] font-medium">Profit: {formatINR(p.profitPaise)}</p>
                      ) : (
                        <p className="text-[10px] text-emerald-700 font-medium">In Catalogue</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-5 py-8 text-center text-xs text-[#172321]/50">No sales recorded yet for this period.</p>
            )}
          </section>

          {/* Recent Seller Orders */}
          <section className="rounded-xl border border-[#E4DACE] bg-white overflow-hidden shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E4DACE] px-5 py-4">
              <div>
                <h2 className="text-sm font-serif font-bold text-[#172321]">Recent Fulfilment Orders</h2>
                <p className="text-[11px] text-[#172321]/60">Direct customer orders assigned to your workshop</p>
              </div>
              <Link to="/seller/orders" className="text-xs text-[#D98263] font-medium hover:underline">
                View All Orders →
              </Link>
            </div>
            {data.recentOrders.length ? (
              <ul className="divide-y divide-[#E4DACE]">
                {data.recentOrders.map((order) => (
                  <li key={order.id}>
                    <Link
                      to={`/seller/orders/${order.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-[#FAF7F2] transition-colors"
                    >
                      <div>
                        <p className="text-xs font-semibold text-[#172321]">{order.reference}</p>
                        <p className="text-[11px] text-[#172321]/60">
                          {order.orderNumber} · Dispatch by {order.dispatchBy ? formatDate(order.dispatchBy) : 'not scheduled'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs font-bold text-[#172321]">{formatINR(order.totalPaise)}</p>
                          <p className="text-[10px] text-[#D98263]">Earning: {formatINR(order.earningPaise)}</p>
                        </div>
                        <StatusBadge status={order.status} label={sellerOrderStatusLabel(order.status)} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-10 text-center text-xs text-[#172321]/50">No paid orders yet.</p>
            )}
          </section>
        </div>

        {/* Sidebar Column: Financial Settlement Ledger & Store Policy */}
        <div className="space-y-6">
          {/* Financial Settlement Ledger */}
          <section className="rounded-xl border border-[#E4DACE] bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E4DACE] pb-3">
              <h2 className="text-sm font-serif font-bold text-[#172321]">Payout & Ledger Status</h2>
              <Link to="/seller/earnings" className="text-xs text-[#D98263] hover:underline">
                Ledger Details →
              </Link>
            </div>
            <dl className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-[#E4DACE]/60 pb-2.5">
                <dt className="text-[#172321]/60">Ledger Pending (in return window)</dt>
                <dd className="font-semibold text-[#172321]">{formatINR(data.ledger.pending)}</dd>
              </div>
              <div className="flex items-center justify-between border-b border-[#E4DACE]/60 pb-2.5">
                <dt className="text-[#172321]/60">Eligible For Settlement</dt>
                <dd className="font-semibold text-emerald-700">{formatINR(data.ledger.eligible)}</dd>
              </div>
              <div className="flex items-center justify-between border-b border-[#E4DACE]/60 pb-2.5">
                <dt className="text-[#172321]/60">Settled to Date</dt>
                <dd className="font-semibold text-[#172321]">{formatINR(data.ledger.settled)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[#172321]/60">Pending Settlement Batches</dt>
                <dd className="font-semibold text-[#D98263]">{data.settlement.pending_batches} batch</dd>
              </div>
            </dl>
          </section>

          {/* Active Store Readiness & GI Authentication */}
          <section className="rounded-xl border border-[#E4DACE] bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E4DACE] pb-3">
              <h2 className="text-sm font-serif font-bold text-[#172321]">Workshop Readiness</h2>
              <StatusBadge status={data.store.status} label={STORE_STATUS_LABELS[data.store.status] ?? humanise(data.store.status)} />
            </div>
            <ul className="mt-3 divide-y divide-[#E4DACE] text-xs">
              {data.checklist.map((item) => (
                <li key={item.id} className="py-2.5 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-[#172321]">{item.label}</p>
                    <p className="text-[10.5px] text-[#172321]/60">{item.detail}</p>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide shrink-0">
                    {item.status === 'complete' ? '✓ Verified' : 'Pending'}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Commission transparency note */}
          <div className="rounded-xl border border-[#66745A]/25 bg-[#FAF7F2] p-4 text-[11px] leading-relaxed text-[#172321]/70">
            <p className="font-serif font-bold text-[#172321] text-xs">Commission & settlement</p>
            <p className="mt-1">{data.commissionNote}</p>
            <p className="mt-2 text-[10.5px] text-[#66745A]">
              Settlement figures in the ledger reflect recorded entries only. Bank/UPI payout details are reviewed manually;
              no automatic transfer is claimed until a payout provider is configured.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SellerProductsPage() {
  const [status, setStatus] = useState('');
  const products = useQuery({
    queryKey: ['seller-products', status],
    queryFn: () => api<{ products: SellerProduct[] }>(`/seller/products${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  });
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (product: SellerProduct, action: 'submit' | 'pause' | 'resume' | 'archive') => {
    if (action === 'archive' && !window.confirm(`Archive ${product.name}? It will leave the public catalogue.`)) return;
    setBusy(product.id);
    try {
      await api(`/seller/products/${product.id}/${action}`, { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['seller-products'] });
      await queryClient.invalidateQueries({ queryKey: ['seller-dashboard'] });
      toast.push('Product status updated.');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        lede="Draft and edit listings, add photographs, keep stock honest, and submit changes for moderation."
        actions={<LinkButton to="/seller/products/new">Add product</LinkButton>}
      />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Select value={status} onChange={(event) => setStatus(event.target.value)} className="max-w-52">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="pending">In review / changes requested</option>
          <option value="approved">Live</option>
          <option value="rejected">Rejected</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </Select>
        <p className="text-[11px] text-muted">{products.data?.products.length ?? 0} listing{products.data?.products.length === 1 ? '' : 's'}</p>
      </div>
      <div className="mt-6">
        {products.isLoading ? <LoadingBlock rows={4} /> : null}
        {products.isError ? <ErrorState onRetry={() => void products.refetch()} /> : null}
        {products.data?.products.length === 0 ? (
          <EmptyState
            title="No products in this view"
            body="Create a draft, add at least one photograph and stock, then submit it for review."
            action={<LinkButton to="/seller/products/new">Add product</LinkButton>}
          />
        ) : null}
        <div className="overflow-x-auto border border-line bg-surface">
          {products.data?.products.length ? (
            <table className="min-w-full text-left text-[12.5px]">
              <thead className="border-b border-line bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Stock</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {products.data.products.map((product) => (
                  <tr key={product.id} className="align-top">
                    <td className="px-4 py-4">
                      <div className="flex items-start gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden bg-sand/40">
                          {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : null}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link to={`/seller/products/${product.id}/edit`} className="font-medium text-forest hover:text-terra">{product.name}</Link>
                            {product.isDemo ? <DemoBadge /> : null}
                          </div>
                          <p className="text-[10.5px] text-muted">{product.sku} · {product.categoryName}</p>
                          {product.moderationNote ? <p className="mt-1 max-w-xs text-[10.5px] text-[#8e4630]">Reviewer: {product.moderationNote}</p> : product.rejectionReason ? <p className="mt-1 max-w-xs text-[10.5px] text-terra">{product.rejectionReason}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4"><StatusBadge status={product.workflowStatus ?? product.status} label={PRODUCT_WORKFLOW_LABELS[product.workflowStatus ?? product.status]} /></td>
                    <td className="px-4 py-4">{formatINR(product.pricePaise)}</td>
                    <td className="px-4 py-4">
                      <p>{product.stock}</p>
                      {product.reserved > 0 ? <p className="text-[10.5px] text-muted">{product.reserved} reserved</p> : null}
                    </td>
                    <td className="px-4 py-4 text-muted">{formatDate(product.updatedAt)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        <LinkButton to={`/seller/products/${product.id}/edit`} size="sm" variant="secondary">Edit</LinkButton>
                        {['draft', 'rejected', 'paused'].includes(product.status) || product.workflowStatus === 'changes_requested' ? (
                          <Button size="sm" loading={busy === product.id} onClick={() => void act(product, 'submit')}>Submit</Button>
                        ) : null}
                        {product.status === 'approved' ? (
                          <Button size="sm" variant="ghost" onClick={() => void act(product, 'pause')}>Pause</Button>
                        ) : null}
                        {product.status === 'paused' ? (
                          <Button size="sm" variant="ghost" onClick={() => void act(product, 'resume')}>Resume</Button>
                        ) : null}
                        {product.status !== 'archived' ? (
                          <Button size="sm" variant="ghost" onClick={() => void act(product, 'archive')}>Archive</Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface ProductCompliance {
  ingredients: string;
  shelfLife: string;
  batchNumber: string;
  fssaiLicense: string;
  storage: string;
  allergenInfo: string;
}

interface ProductEditorResponse {
  product: {
    id: string;
    name: string;
    slug: string;
    categoryId: string;
    shortDescription: string;
    description: string;
    pricePaise: number;
    compareAtPricePaise: number | null;
    estimatedCostPaise?: number;
    packagingCostPaise?: number;
    varietyGrade?: string | null;
    harvestInfo?: string | null;
    dispatchConditions?: string | null;
    sku: string;
    unit: string;
    weightG: number | null;
    dimensions: string | null;
    materials: string | null;
    careInstructions: string | null;
    foodInfo: string | null;
    compliance: Partial<ProductCompliance> | null;
    workflowStatus: string;
    moderationNote: string | null;
    originPlace: string | null;
    originVerified: boolean;
    region: string | null;
    attributes: Record<string, string> | null;
    status: ProductStatus;
    rejectionReason: string | null;
    images: { id: string; url: string; alt: string; credit: string | null }[];
    inventory: { quantity: number; reserved: number; lowStockThreshold: number };
    taxRateBp: number;
    isDemo: boolean;
  };
  commissionNote: string;
}

const EMPTY_COMPLIANCE: ProductCompliance = {
  ingredients: '',
  shelfLife: '',
  batchNumber: '',
  fssaiLicense: '',
  storage: '',
  allergenInfo: '',
};

const EMPTY_PRODUCT = {
  name: '',
  categoryId: '',
  shortDescription: '',
  description: '',
  priceRupees: '',
  compareAtRupees: '',
  estimatedCostRupees: '',
  packagingCostRupees: '',
  varietyGrade: '',
  harvestInfo: '',
  dispatchConditions: '',
  sku: '',
  unit: 'piece',
  weightG: '',
  dimensions: '',
  materials: '',
  careInstructions: '',
  foodInfo: '',
  compliance: { ...EMPTY_COMPLIANCE },
  originPlace: '',
  region: '',
};

function toPaise(value: string): number {
  return Math.round(Number(value || 0) * 100);
}

export function SellerProductEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [prefilledProductId, setPrefilledProductId] = useState<string | null>(null);

  // Direct & Pending Image Queue
  const [pendingPhotos, setPendingPhotos] = useState<
    Array<{ id: string; file: File; previewUrl: string; alt: string; sizeKb: number }>
  >([]);
  const [uploadingDirect, setUploadingDirect] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Stepper / Section view state ('all' or 1..6)
  const [activeStep, setActiveStep] = useState<number | 'all'>('all');

  // Inventory state
  const [inventory, setInventory] = useState({ quantity: '10', lowStockThreshold: '3', note: '' });

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<{ categories: Category[]; subcategories: Category[] }>('/categories'),
  });

  const product = useQuery({
    queryKey: ['seller-product', id],
    queryFn: () => api<ProductEditorResponse>(`/seller/products/${id}`),
    enabled: Boolean(id),
  });

  const sellerConfig = useQuery<{
    commission: { defaultBp: number; categoryRates: Record<string, number>; note: string };
  }>({
    queryKey: ['seller-config'],
    queryFn: () => api('/seller/config'),
    staleTime: 5 * 60_000,
  });

  const workflowStatus = product.data?.product?.workflowStatus;
  const inReview = workflowStatus === 'submitted';

  // Category determination
  const selectedCategoryObj =
    categories.data?.categories.find((c) => c.id === form.categoryId) ||
    categories.data?.subcategories.find((c) => c.id === form.categoryId);

  // Publication requirements follow the product category, not the maker's own
  // category. A farmer who also sells a woven blanket still needs textile
  // details for that listing, and a craft shop selling preserves still needs
  // the food information.
  const complianceGroup = complianceGroupFor(selectedCategoryObj?.slug, selectedCategoryObj?.name);
  const complianceGuide = COMPLIANCE_GUIDES[complianceGroup];
  const needsMaterialDetails = ['textile', 'clothing', 'craft'].includes(complianceGroup);

  const isFruitCategory =
    selectedCategoryObj?.slug?.includes('fruit') ||
    selectedCategoryObj?.slug?.includes('produce') ||
    selectedCategoryObj?.slug?.includes('apple') ||
    selectedCategoryObj?.name?.toLowerCase().includes('fruit') ||
    selectedCategoryObj?.name?.toLowerCase().includes('produce');

  const isTextileCategory =
    selectedCategoryObj?.slug?.includes('textile') ||
    selectedCategoryObj?.slug?.includes('clothing') ||
    selectedCategoryObj?.slug?.includes('woollen') ||
    selectedCategoryObj?.slug?.includes('shawl') ||
    selectedCategoryObj?.name?.toLowerCase().includes('clothing') ||
    selectedCategoryObj?.name?.toLowerCase().includes('shawl');

  const isCraftCategory =
    selectedCategoryObj?.slug?.includes('craft') ||
    selectedCategoryObj?.slug?.includes('wood') ||
    selectedCategoryObj?.slug?.includes('metal') ||
    selectedCategoryObj?.name?.toLowerCase().includes('craft') ||
    selectedCategoryObj?.name?.toLowerCase().includes('handicraft');

  // Populate editor on load
  const loadedProduct = product.data?.product;
  if (loadedProduct && prefilledProductId !== loadedProduct.id) {
    setPrefilledProductId(loadedProduct.id);
    setForm({
      name: loadedProduct.name,
      categoryId: loadedProduct.categoryId,
      shortDescription: loadedProduct.shortDescription,
      description: loadedProduct.description,
      priceRupees: (loadedProduct.pricePaise / 100).toFixed(2).replace(/\.00$/, ''),
      compareAtRupees: loadedProduct.compareAtPricePaise
        ? (loadedProduct.compareAtPricePaise / 100).toFixed(2).replace(/\.00$/, '')
        : '',
      estimatedCostRupees: loadedProduct.estimatedCostPaise
        ? (loadedProduct.estimatedCostPaise / 100).toFixed(2).replace(/\.00$/, '')
        : '',
      packagingCostRupees: loadedProduct.packagingCostPaise
        ? (loadedProduct.packagingCostPaise / 100).toFixed(2).replace(/\.00$/, '')
        : '',
      varietyGrade: loadedProduct.varietyGrade ?? '',
      harvestInfo: loadedProduct.harvestInfo ?? '',
      dispatchConditions: loadedProduct.dispatchConditions ?? '',
      sku: loadedProduct.sku,
      unit: loadedProduct.unit,
      weightG: loadedProduct.weightG ? String(loadedProduct.weightG) : '',
      dimensions: loadedProduct.dimensions ?? '',
      materials: loadedProduct.materials ?? '',
      careInstructions: loadedProduct.careInstructions ?? '',
      foodInfo: loadedProduct.foodInfo ?? '',
      compliance: {
        ingredients: loadedProduct.compliance?.ingredients ?? '',
        shelfLife: loadedProduct.compliance?.shelfLife ?? '',
        batchNumber: loadedProduct.compliance?.batchNumber ?? '',
        fssaiLicense: loadedProduct.compliance?.fssaiLicense ?? '',
        storage: loadedProduct.compliance?.storage ?? '',
        allergenInfo: loadedProduct.compliance?.allergenInfo ?? '',
      },
      originPlace: loadedProduct.originPlace ?? '',
      region: loadedProduct.region ?? '',
    });
    setInventory({
      quantity: String(loadedProduct.inventory.quantity),
      lowStockThreshold: String(loadedProduct.inventory.lowStockThreshold),
      note: '',
    });
  }

  // Handle incoming photos from dropzone or file picker
  const handleFiles = (files: FileList | File[]) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const added: typeof pendingPhotos = [];
    for (const file of Array.from(files)) {
      if (!validTypes.includes(file.type.toLowerCase())) {
        toast.push(`${file.name}: only JPEG, PNG, or WebP images are permitted.`, 'error');
        continue;
      }
      if (file.size > 8 * 1024 * 1024) {
        toast.push(`${file.name} is larger than the 8MB limit.`, 'error');
        continue;
      }
      added.push({
        id: 'pend_' + Math.random().toString(36).slice(2, 9),
        file,
        previewUrl: URL.createObjectURL(file),
        alt: form.name ? `${form.name} photograph` : 'Authentic Himachali product photograph',
        sizeKb: Math.round(file.size / 1024),
      });
    }

    if (added.length > 0) {
      setPendingPhotos((prev) => {
        const totalExisting = loadedProduct?.images.length ?? 0;
        const total = prev.length + added.length + totalExisting;
        if (total > 6) {
          toast.push(`Maximum 6 photographs permitted. Kept ${Math.max(0, 6 - totalExisting - prev.length)} new ones.`, 'error');
          return [...prev, ...added].slice(0, Math.max(0, 6 - totalExisting));
        }
        return [...prev, ...added];
      });
      toast.push(`${added.length} photograph${added.length === 1 ? '' : 's'} added to queue.`);
    }
  };

  const removePendingPhoto = (photoId: string) => {
    setPendingPhotos((prev) => {
      const match = prev.find((p) => p.id === photoId);
      if (match?.previewUrl) URL.revokeObjectURL(match.previewUrl);
      return prev.filter((p) => p.id !== photoId);
    });
  };

  const generateAutoSku = () => {
    const raw = (form.name || 'PRODUCT').replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'HPR';
    const num = Math.floor(1000 + Math.random() * 9000);
    const newSku = `HR-${raw}-${num}`;
    setForm((prev) => ({ ...prev, sku: newSku }));
    toast.push(`Generated SKU: ${newSku}`);
  };

  // Upload pending photos directly for an existing product
  const uploadPendingToExisting = async () => {
    if (!id || pendingPhotos.length === 0) return;
    setUploadingDirect(true);
    let successCount = 0;
    try {
      for (const photo of pendingPhotos) {
        const data = new FormData();
        data.append('image', photo.file);
        data.append('alt', photo.alt || `${form.name || 'Himachali creation'} photo`);
        await api(`/seller/products/${id}/images`, { method: 'POST', body: data });
        successCount++;
      }
      setPendingPhotos([]);
      await queryClient.invalidateQueries({ queryKey: ['seller-product', id] });
      toast.push(`Successfully uploaded ${successCount} photograph${successCount === 1 ? '' : 's'}!`);
    } catch (err) {
      toast.push(errorMessage(err), 'error');
    } finally {
      setUploadingDirect(false);
    }
  };

  const deleteExistingImage = async (imageId: string) => {
    if (!id || !window.confirm('Delete this photograph?')) return;
    try {
      await api(`/seller/products/${id}/images/${imageId}`, { method: 'DELETE' });
      await queryClient.invalidateQueries({ queryKey: ['seller-product', id] });
      toast.push('Photograph deleted.');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    }
  };

  // Main Save handler (saves product, uploads pending images, updates stock, and optionally submits)
  const saveProduct = async (shouldSubmit = false) => {
    if (inReview) {
      toast.push('This listing is with a reviewer. Wait for the decision before editing it.', 'error');
      return;
    }

    if (!form.name.trim()) {
      setFields({ name: 'Product name is required.' });
      toast.push('Please enter a product name.', 'error');
      setActiveStep(1);
      return;
    }

    if (!form.categoryId) {
      setFields({ categoryId: 'Please choose a category.' });
      toast.push('Please choose a product category.', 'error');
      setActiveStep(1);
      return;
    }

    if (!form.priceRupees || Number(form.priceRupees) < 1) {
      setFields({ pricePaise: 'Set a valid selling price (at least ₹1).' });
      toast.push('Please set a customer selling price.', 'error');
      setActiveStep(5);
      return;
    }

    if (shouldSubmit) {
      const missing: Record<string, string> = {};
      if (complianceGroup === 'food') {
        if (form.compliance.fssaiLicense && !/^\d{14}$/.test(form.compliance.fssaiLicense.trim())) {
          missing['compliance.fssaiLicense'] = 'Enter a 14-digit FSSAI registration or licence number.';
        }
        if (form.compliance.ingredients.trim().length < 3) {
          missing['compliance.ingredients'] = 'List the ingredients used in this product.';
        }
        if (form.compliance.allergenInfo.trim().length < 2) {
          missing['compliance.allergenInfo'] = 'Declare allergens, or state that none are known.';
        }
        if (form.compliance.shelfLife.trim().length < 2) {
          missing['compliance.shelfLife'] = 'State the shelf life or best-before period.';
        }
        if (form.compliance.storage.trim().length < 3) {
          missing['compliance.storage'] = 'Describe how the product should be stored.';
        }
      }
      if (needsMaterialDetails && form.materials.trim().length < 3) {
        missing.materials = 'Describe the fibre or material composition.';
      }
      if (complianceGroup === 'clothing') {
        if (form.dimensions.trim().length < 2) {
          missing.dimensions = 'Add the size or key measurements.';
        }
        if (form.careInstructions.trim().length < 3) {
          missing.careInstructions = 'Add washing and care instructions.';
        }
      }
      if (Object.keys(missing).length) {
        setFields(missing);
        toast.push('Add the category-specific information before submitting for review.', 'error');
        const provenanceOnly = Object.keys(missing).every((key) =>
          ['materials', 'dimensions', 'careInstructions'].includes(key),
        );
        setActiveStep(provenanceOnly ? 3 : 7);
        return;
      }
    }

    setSaving(true);
    setFields({});

    const compliance = Object.fromEntries(
      Object.entries(form.compliance)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value.length > 0),
    );

    let effectiveSku = form.sku.trim();
    if (!effectiveSku) {
      const raw = form.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'HPR';
      effectiveSku = `HR-${raw}-${Math.floor(1000 + Math.random() * 9000)}`;
      setForm((prev) => ({ ...prev, sku: effectiveSku }));
    }

    const payload = {
      name: form.name.trim(),
      categoryId: form.categoryId,
      shortDescription: form.shortDescription.trim() || `${form.name.trim()} — Authentic Himalayan handpicked creation.`,
      description: form.description.trim() || `${form.name.trim()}. Handcrafted with traditional Himachali artisan techniques and authentic regional materials.`,
      pricePaise: toPaise(form.priceRupees),
      compareAtPricePaise: form.compareAtRupees ? toPaise(form.compareAtRupees) : null,
      estimatedCostPaise: form.estimatedCostRupees ? toPaise(form.estimatedCostRupees) : 0,
      packagingCostPaise: form.packagingCostRupees ? toPaise(form.packagingCostRupees) : 0,
      varietyGrade: form.varietyGrade || undefined,
      harvestInfo: form.harvestInfo || undefined,
      dispatchConditions: form.dispatchConditions || undefined,
      sku: effectiveSku,
      unit: form.unit.trim() || 'piece',
      weightG: form.weightG ? Number(form.weightG) : 500,
      dimensions: form.dimensions || undefined,
      materials: form.materials || undefined,
      careInstructions: form.careInstructions || undefined,
      foodInfo: form.foodInfo || undefined,
      compliance: Object.keys(compliance).length ? compliance : undefined,
      originPlace: form.originPlace || undefined,
      region: form.region || undefined,
    };

    try {
      let targetProductId = id;

      if (isNew) {
        // 1. Create product
        const result = await api<{ id: string; sku?: string }>('/seller/products', { method: 'POST', body: payload });
        targetProductId = result.id;
      } else {
        // Update product
        await api(`/seller/products/${id}`, { method: 'PATCH', body: payload });
      }

      // 2. Upload any queued photographs
      if (pendingPhotos.length > 0 && targetProductId) {
        for (const photo of pendingPhotos) {
          try {
            const data = new FormData();
            data.append('image', photo.file);
            data.append('alt', photo.alt || `${form.name} photo`);
            await api(`/seller/products/${targetProductId}/images`, { method: 'POST', body: data });
          } catch (uploadErr) {
            console.error('Image upload warning:', uploadErr);
          }
        }
        setPendingPhotos([]);
      }

      // 3. Save initial inventory
      if (targetProductId && inventory.quantity) {
        try {
          await api(`/seller/inventory/${targetProductId}`, {
            method: 'POST',
            body: {
              quantity: Number(inventory.quantity) || 0,
              lowStockThreshold: Number(inventory.lowStockThreshold) || 3,
              note: inventory.note || 'Initial catalogue stock',
            },
          });
        } catch (stockErr) {
          console.error('Inventory update warning:', stockErr);
        }
      }

      // 4. Submit for review if requested
      if (shouldSubmit && targetProductId) {
        try {
          await api(`/seller/products/${targetProductId}/submit`, { method: 'POST' });
          toast.push('🎉 Product created, photos uploaded, and submitted for review!');
        } catch (subErr) {
          toast.push(`Product saved, but review submission note: ${errorMessage(subErr)}`, 'error');
        }
      } else {
        toast.push(isNew ? '✓ Product draft created with photos and stock saved!' : '✓ Product updated successfully!');
      }

      await queryClient.invalidateQueries({ queryKey: ['seller-products'] });
      await queryClient.invalidateQueries({ queryKey: ['seller-product', targetProductId] });

      if (isNew && targetProductId) {
        navigate(`/seller/products/${targetProductId}/edit`, { replace: true });
      }
    } catch (error) {
      setFields(errorFields(error));
      toast.push(errorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const submitExistingForReview = async () => {
    if (!id) return;
    try {
      await api(`/seller/products/${id}/submit`, { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['seller-product', id] });
      await queryClient.invalidateQueries({ queryKey: ['seller-products'] });
      toast.push('Listing submitted for review.');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    }
  };

  if (id && product.isLoading) return <LoadingBlock rows={4} />;
  if (id && (product.isError || !product.data)) {
    return (
      <ErrorState
        title="Product not found"
        body="This listing does not belong to your seller account."
        onRetry={() => void product.refetch()}
      />
    );
  }

  const current = product.data?.product;
  const existingImages = current?.images ?? [];

  // Live unit economics use the seller/category commission rule resolved by
  // the API, falling back to the configured marketplace default only while the
  // config request is loading.
  const commissionBp =
    sellerConfig.data?.commission.categoryRates[form.categoryId] ??
    sellerConfig.data?.commission.defaultBp ??
    1500;
  const priceNum = Number(form.priceRupees || 0);
  const cogsNum = Number(form.estimatedCostRupees || 0);
  const pkgNum = Number(form.packagingCostRupees || 0);
  const commissionNum = priceNum * (commissionBp / 10000);
  const unitProfitNum = Math.max(0, priceNum - commissionNum - cogsNum - pkgNum);
  const unitMarginPercent = priceNum > 0 ? ((unitProfitNum / priceNum) * 100).toFixed(1) : '0.0';

  const steps = [
    { num: 1, label: 'Basics & Category', icon: '🏷️' },
    { num: 2, label: 'Photos & Gallery', icon: '📷', count: existingImages.length + pendingPhotos.length },
    { num: 3, label: 'Himachal Provenance', icon: '🏔️' },
    { num: 4, label: 'Story & Description', icon: '✍️' },
    { num: 5, label: 'Pricing & Profit', icon: '💰' },
    { num: 6, label: 'Stock & Fulfilment', icon: '📦' },
    ...(complianceGroup !== 'general'
      ? [
          {
            num: 7,
            label: complianceGroup === 'food' ? 'Food compliance' : 'Category requirements',
            icon: '📋',
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header Bar */}
      <div className="rounded-2xl border border-[#E4DACE] bg-gradient-to-r from-[#FAF7F2] via-white to-[#FAF3EF] p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#172321] text-white px-2.5 py-0.5 text-xs font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D98263]" />
                {isNew ? 'New Catalogue Product' : 'Editing Product'}
              </span>
              {!isNew && current ? (
                <StatusBadge
                  status={current.workflowStatus ?? current.status}
                  label={PRODUCT_WORKFLOW_LABELS[current.workflowStatus ?? current.status] ?? humanise(current.status)}
                />
              ) : null}
            </div>
            <h1 className="mt-2 text-2xl sm:text-3xl font-serif font-bold text-[#172321]">
              {isNew ? 'Add an Authentic Himachali Product' : form.name || 'Edit Product Listing'}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#172321]/70 max-w-2xl">
              Showcase authentic mountain creations from Himachal Pradesh. Fill in the details in sequence, upload
              photographs directly, calculate your net profit margin, and submit for marketplace review.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <LinkButton to="/seller/products" variant="secondary" size="sm">
              ← Back to Catalogue
            </LinkButton>
            {!isNew && current?.status === 'approved' ? (
              <LinkButton to={`/shop/${current.slug}`} size="sm" variant="secondary">
                View Live ↗
              </LinkButton>
            ) : null}
            {!isNew && current && (['draft', 'rejected', 'paused'].includes(current.status) || current.workflowStatus === 'changes_requested') ? (
              <Button size="sm" variant="ghost" onClick={() => void submitExistingForReview()}>
                {current.workflowStatus === 'changes_requested' ? 'Resubmit for Review' : 'Submit for Review'}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              loading={saving}
              disabled={inReview}
              onClick={() => void saveProduct(false)}
            >
              {isNew ? 'Save Draft' : 'Save Changes'}
            </Button>
            <Button
              size="sm"
              loading={saving}
              disabled={inReview}
              onClick={() => void saveProduct(true)}
              className="bg-[#D98263] text-white hover:bg-[#c26e50] border-transparent font-medium shadow-xs"
            >
              ✓ {isNew ? 'Create & Submit' : 'Save & Submit'}
            </Button>
          </div>
        </div>

        {/* Sequential Step Progress Navigator Bar */}
        <div className="mt-6 pt-5 border-t border-[#E4DACE]/70">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#172321]/60">
              Listing Sequence Guide
            </span>
            <button
              type="button"
              onClick={() => setActiveStep('all')}
              className={`text-xs font-medium px-2 py-0.5 rounded transition-colors ${
                activeStep === 'all' ? 'bg-[#172321] text-white' : 'text-[#D98263] hover:underline'
              }`}
            >
              View All Sections
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-6 gap-2">
            {steps.map((s) => {
              const isSelected = activeStep === s.num;
              return (
                <button
                  key={s.num}
                  type="button"
                  onClick={() => setActiveStep(s.num)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-left text-xs transition-all border ${
                    isSelected
                      ? 'border-[#D98263] bg-[#FAF3EF] text-[#D98263] font-bold shadow-xs'
                      : 'border-[#E4DACE] bg-white text-[#172321]/80 hover:border-[#D98263]/50'
                  }`}
                >
                  <span className="text-sm shrink-0">{s.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider opacity-60">Step {s.num}</p>
                    <p className="truncate font-medium">{s.label}</p>
                  </div>
                  {s.count !== undefined && s.count > 0 ? (
                    <span className="ml-auto inline-flex items-center justify-center rounded-full bg-[#172321]/10 px-1.5 text-[10px] font-bold text-[#172321]">
                      {s.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Moderation Alerts if any */}
      {current?.workflowStatus === 'changes_requested' ? (
        <Alert tone="warning" title="Reviewer Feedback — Changes Requested">
          {current.moderationNote ?? current.rejectionReason ?? 'Update the requested details below and resubmit.'}
        </Alert>
      ) : current?.rejectionReason ? (
        <Alert tone="warning" title="Moderation Note">{current.rejectionReason}</Alert>
      ) : null}

      {inReview ? (
        <Alert tone="info" title="Under Review">
          This listing is currently in the moderation queue and is read-only until approved by the admin team.
        </Alert>
      ) : null}

      {/* Main Form Body Arranged in Sequences */}
      <div className="space-y-6">
        {/* =========================================================================
            STEP 1: Basic Information & Category Foundation
            ========================================================================= */}
        {(activeStep === 'all' || activeStep === 1) && (
          <section className="rounded-2xl border border-[#E4DACE] bg-white p-5 sm:p-7 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E4DACE] pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FAF3EF] text-sm text-[#D98263] font-bold border border-[#D98263]/30">
                  1
                </span>
                <div>
                  <h2 className="text-lg font-serif font-bold text-[#172321]">Core Essentials & Category</h2>
                  <p className="text-xs text-[#172321]/60">Product title, unique SKU identifier, unit of sale, and category</p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-medium">
                Mandatory
              </span>
            </div>

            <div className="mt-5 space-y-4">
              <Field label="Product Title" required error={fields.name} hint="e.g. Royal Delicious Shimla Hill Apples, Handwoven Kullu Merino Shawl">
                <Input
                  required
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="e.g. Pure Himalayan Wild Multiflora Honey"
                  className="font-medium text-base text-[#172321]"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Product Category" required error={fields.categoryId} hint="Choose the most appropriate Himachali catalogue department">
                  <Select
                    required
                    value={form.categoryId}
                    onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
                  >
                    <option value="">Select a category</option>
                    {categories.data?.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                    {categories.data?.subcategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        ↳ {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#172321]">
                      SKU Code <span className="text-[#D98263]">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={generateAutoSku}
                      className="text-[11px] font-semibold text-[#D98263] hover:underline flex items-center gap-1"
                    >
                      ✨ Auto-generate SKU
                    </button>
                  </div>
                  <div className="mt-1">
                    <Input
                      value={form.sku}
                      onChange={(event) => setForm({ ...form, sku: event.target.value.toUpperCase() })}
                      placeholder="e.g. HR-APPL-4921"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-[#172321]/55">Leave blank to auto-generate from product name.</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Unit of Sale" required hint="e.g. 1 kg box, piece, 500 g jar, pair, set of 4">
                  <Input
                    required
                    value={form.unit}
                    onChange={(event) => setForm({ ...form, unit: event.target.value })}
                    placeholder="e.g. 5 kg carton"
                  />
                </Field>
                <Field label="Packed Shipping Weight (Grams)" required hint="Used to accurately calculate express courier freight tier">
                  <Input
                    inputMode="numeric"
                    value={form.weightG}
                    onChange={(event) => setForm({ ...form, weightG: event.target.value.replace(/\D/g, '') })}
                    placeholder="e.g. 1500 (for 1.5 kg)"
                  />
                </Field>
              </div>
            </div>
          </section>
        )}

        {/* =========================================================================
            STEP 2: Visual Photography & Product Gallery (Direct Upload Enabled)
            ========================================================================= */}
        {(activeStep === 'all' || activeStep === 2) && (
          <section className="rounded-2xl border border-[#E4DACE] bg-white p-5 sm:p-7 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E4DACE] pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FAF3EF] text-sm text-[#D98263] font-bold border border-[#D98263]/30">
                  2
                </span>
                <div>
                  <h2 className="text-lg font-serif font-bold text-[#172321]">Product Photographs & Gallery</h2>
                  <p className="text-xs text-[#172321]/60">
                    Add clear, high-resolution photographs. First image acts as the primary catalogue cover. Up to 6 photos.
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-[#172321]/10 px-2.5 py-0.5 text-xs font-semibold text-[#172321]">
                {existingImages.length + pendingPhotos.length} / 6 Photos
              </span>
            </div>

            {/* Existing Saved Photographs (if any) */}
            {existingImages.length > 0 && (
              <div className="mt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#172321]/60 mb-3">
                  Currently Saved In Catalogue
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {existingImages.map((img, idx) => (
                    <div
                      key={img.id}
                      className="group relative rounded-xl border border-[#E4DACE] bg-[#FAF7F2] overflow-hidden shadow-xs"
                    >
                      <img src={img.url} alt={img.alt} className="aspect-square w-full object-cover" />
                      {idx === 0 && (
                        <span className="absolute top-1.5 left-1.5 rounded-md bg-[#172321]/90 text-white text-[9px] font-bold uppercase px-1.5 py-0.5">
                          Cover
                        </span>
                      )}
                      <div className="p-2 bg-white">
                        <p className="truncate text-[10px] text-[#172321]/70">{img.alt || 'Product Photo'}</p>
                        <button
                          type="button"
                          onClick={() => void deleteExistingImage(img.id)}
                          className="mt-1 text-[10.5px] font-medium text-[#D98263] hover:underline"
                        >
                          ✕ Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Queued Photographs (Selected for upload) */}
            {pendingPhotos.length > 0 && (
              <div className="mt-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#D98263]">
                    Selected Photographs Ready for Upload ({pendingPhotos.length})
                  </h3>
                  {!isNew && (
                    <Button
                      size="sm"
                      onClick={() => void uploadPendingToExisting()}
                      loading={uploadingDirect}
                      className="bg-[#D98263] text-white hover:bg-[#c26e50] border-transparent text-xs"
                    >
                      Upload Now
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {pendingPhotos.map((photo, pIdx) => (
                    <div
                      key={photo.id}
                      className="relative rounded-xl border-2 border-dashed border-[#D98263]/60 bg-[#FAF3EF]/50 overflow-hidden shadow-xs"
                    >
                      <img src={photo.previewUrl} alt={photo.alt} className="aspect-square w-full object-cover" />
                      {existingImages.length === 0 && pIdx === 0 && (
                        <span className="absolute top-1.5 left-1.5 rounded-md bg-[#D98263] text-white text-[9px] font-bold uppercase px-1.5 py-0.5">
                          Cover
                        </span>
                      )}
                      <div className="p-2 bg-white/95">
                        <p className="truncate text-[10px] font-medium text-[#172321]">{photo.file.name}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[9.5px] text-[#172321]/50">{photo.sizeKb} KB</span>
                          <button
                            type="button"
                            onClick={() => removePendingPhoto(photo.id)}
                            className="text-[10px] text-red-600 font-semibold hover:underline"
                          >
                            ✕ Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {isNew && (
                  <p className="mt-2 text-[11px] text-[#66745A]">
                    ✓ These {pendingPhotos.length} photograph{pendingPhotos.length === 1 ? '' : 's'} will be uploaded
                    automatically when you save the product below!
                  </p>
                )}
              </div>
            )}

            {/* Interactive Drag & Drop Zone */}
            {existingImages.length + pendingPhotos.length < 6 ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  if (e.dataTransfer.files?.length) {
                    handleFiles(e.dataTransfer.files);
                  }
                }}
                onClick={() => {
                  const input = document.getElementById('seller-file-dropzone-input') as HTMLInputElement | null;
                  input?.click();
                }}
                className={`mt-5 cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
                  dragActive
                    ? 'border-[#D98263] bg-[#FAF3EF]'
                    : 'border-[#E4DACE] bg-[#FAF7F2]/60 hover:border-[#D98263]/70 hover:bg-[#FAF3EF]/40'
                }`}
              >
                <input
                  id="seller-file-dropzone-input"
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      handleFiles(e.target.files);
                      e.target.value = '';
                    }
                  }}
                />
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#D98263]/15 text-[#D98263] text-2xl shadow-inner">
                  📸
                </div>
                <h3 className="mt-3 text-sm font-semibold text-[#172321]">
                  Click to browse or drag and drop photographs here
                </h3>
                <p className="mt-1 text-xs text-[#172321]/60">
                  Select 1 to {6 - existingImages.length - pendingPhotos.length} high-quality images · JPG, PNG, or WebP up to 8MB
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-[#172321] border border-[#E4DACE] shadow-xs">
                  <span>📁 Choose Photos</span>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs text-center text-[#66745A] font-medium bg-[#FAF7F2] p-3 rounded-xl border border-[#E4DACE]">
                ✓ Maximum 6 photographs reached. Delete an existing image to upload an alternate.
              </p>
            )}
          </section>
        )}

        {/* =========================================================================
            STEP 3: Authentic Himachal Provenance & Regional Specifications
            ========================================================================= */}
        {(activeStep === 'all' || activeStep === 3) && (
          <section className="rounded-2xl border border-[#E4DACE] bg-white p-5 sm:p-7 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E4DACE] pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FAF3EF] text-sm text-[#D98263] font-bold border border-[#D98263]/30">
                  3
                </span>
                <div>
                  <h2 className="text-lg font-serif font-bold text-[#172321]">Himachal Provenance & Craft Specs</h2>
                  <p className="text-xs text-[#172321]/60">
                    Geographic origin, artisan collective, harvest plucking season, and materials
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-[#66745A]/15 text-[#66745A] px-2.5 py-0.5 text-xs font-semibold">
                Authenticity Seal
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field
                label={
                  isFruitCategory
                    ? 'Fruit Variety & Commercial Grade'
                    : isTextileCategory
                    ? 'Wool or Weave Grade'
                    : isCraftCategory
                    ? 'Craft Material / Wood Variety'
                    : 'Variety or Grade'
                }
                hint={
                  isFruitCategory
                    ? 'e.g. Royal Delicious, Golden Delicious, Super Grade A'
                    : isTextileCategory
                    ? 'e.g. Pure Merino Mountain Wool, Kullu Geometric Motif'
                    : 'e.g. Seasoned Himalayan Walnut Wood, Hand-carved'
                }
              >
                <Input
                  value={form.varietyGrade}
                  onChange={(event) => setForm({ ...form, varietyGrade: event.target.value })}
                  placeholder={
                    isFruitCategory
                      ? 'e.g. Royal Delicious · Extra Fancy Grade'
                      : isTextileCategory
                      ? 'e.g. Handloom Merino Wool · Pure Weave'
                      : 'e.g. Seasoned Wild Walnut'
                  }
                />
              </Field>

              <Field
                label={isFruitCategory ? 'Harvest Season & Orchard Origin' : 'Harvest / Sourcing / Workshop Origin'}
                hint="Specific valley, orchard, or artisan collective"
              >
                <Input
                  value={form.harvestInfo}
                  onChange={(event) => setForm({ ...form, harvestInfo: event.target.value })}
                  placeholder={
                    isFruitCategory
                      ? 'e.g. October 2026 Pluck, Kotgarh Valley'
                      : 'e.g. Handwoven in Kullu district by our workshop'
                  }
                />
              </Field>

              <Field
                label="Dispatch & Packaging Transit Protection"
                hint="Protective packaging or perishable transit details"
                className="sm:col-span-2"
              >
                <Input
                  value={form.dispatchConditions}
                  onChange={(event) => setForm({ ...form, dispatchConditions: event.target.value })}
                  placeholder={
                    isFruitCategory
                      ? 'e.g. Packed in 5-ply ventilated fruit cartons with foam liners; 48h express mountain dispatch'
                      : 'e.g. Shipped in moisture-proof cedar wrap with seal and express tracking'
                  }
                />
              </Field>

              <Field label="Place of Origin / Village / District" hint="Must be in Himachal Pradesh">
                <Input
                  value={form.originPlace}
                  onChange={(event) => setForm({ ...form, originPlace: event.target.value })}
                  placeholder="e.g. Kotgarh, Shimla District"
                />
              </Field>

              <Field label="Valley / Region" hint="Appears on public product provenance badge">
                <Input
                  value={form.region}
                  onChange={(event) => setForm({ ...form, region: event.target.value })}
                  placeholder="e.g. Kullu Valley, Himachal Pradesh"
                />
              </Field>

              <Field label="Materials or Ingredients" className="sm:col-span-2" required={needsMaterialDetails} error={fields.materials}>
                <Input
                  value={form.materials}
                  onChange={(event) => setForm({ ...form, materials: event.target.value })}
                  invalid={Boolean(fields.materials)}
                  placeholder={
                    isTextileCategory
                      ? 'e.g. Handspun sheep wool, cotton lining'
                      : isCraftCategory
                      ? 'e.g. Himalayan Walnut Wood, Natural Beeswax Polish'
                      : 'e.g. Fresh Apples, Mountain Water, Cane Sugar'
                  }
                />
              </Field>

              <Field
                label="Dimensions or Sizing"
                hint={complianceGroup === 'clothing' ? 'Required for clothing listings' : 'Optional sizing specifications'}
                required={complianceGroup === 'clothing'}
                error={fields.dimensions}
              >
                <Input
                  value={form.dimensions}
                  onChange={(event) => setForm({ ...form, dimensions: event.target.value })}
                  invalid={Boolean(fields.dimensions)}
                  placeholder="e.g. 200 × 100 cm (Shawl) or 30 × 20 cm box"
                />
              </Field>

              <Field
                label="Care or Preservation Instructions"
                hint={complianceGroup === 'clothing' ? 'Required for clothing listings' : 'Optional storage advice'}
                required={complianceGroup === 'clothing'}
                error={fields.careInstructions}
              >
                <Input
                  value={form.careInstructions}
                  onChange={(event) => setForm({ ...form, careInstructions: event.target.value })}
                  invalid={Boolean(fields.careInstructions)}
                  placeholder="e.g. Dry clean only or Store in a cool dry dark space"
                />
              </Field>
            </div>
          </section>
        )}

        {/* =========================================================================
            STEP 4: Artisan Story & Product Highlights
            ========================================================================= */}
        {(activeStep === 'all' || activeStep === 4) && (
          <section className="rounded-2xl border border-[#E4DACE] bg-white p-5 sm:p-7 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E4DACE] pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FAF3EF] text-sm text-[#D98263] font-bold border border-[#D98263]/30">
                  4
                </span>
                <div>
                  <h2 className="text-lg font-serif font-bold text-[#172321]">Story & Detailed Description</h2>
                  <p className="text-xs text-[#172321]/60">
                    Tell the heritage behind your creation, why buyers love it, and what makes it special
                  </p>
                </div>
              </div>
              <span className="text-xs text-[#172321]/50 font-mono">
                {form.description.length} characters
              </span>
            </div>

            <div className="mt-5 space-y-4">
              <Field
                label="Short Highlights Summary"
                hint="One to two sentences displayed on catalogue cards and search snippets (max 240 chars)"
              >
                <Textarea
                  rows={2}
                  maxLength={240}
                  value={form.shortDescription}
                  onChange={(event) => setForm({ ...form, shortDescription: event.target.value })}
                  placeholder="e.g. Hand-picked crisp apples from high-altitude Kotgarh orchards, harvested in peak autumn."
                />
                <p className="mt-1 text-right text-[10.5px] text-[#172321]/50">
                  {form.shortDescription.length} / 240
                </p>
              </Field>

              <Field
                label="Full Heritage & Craft Description"
                hint="Explain the crafting tradition, heritage techniques, taste notes, or harvesting journey"
              >
                <Textarea
                  rows={7}
                  maxLength={6000}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Write the story of how this product is made, its cultural significance in Himachal Pradesh, and the artisan heritage behind it..."
                />
                <div className="flex items-center justify-between mt-1 text-[10.5px] text-[#172321]/50">
                  <span>Recommended: at least 80 characters for public moderation approval.</span>
                  <span>{form.description.length} / 6000</span>
                </div>
              </Field>
            </div>
          </section>
        )}

        {/* =========================================================================
            STEP 5: Pricing, Direct Costs & Live Profit Estimator
            ========================================================================= */}
        {(activeStep === 'all' || activeStep === 5) && (
          <section className="rounded-2xl border border-[#E4DACE] bg-white p-5 sm:p-7 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E4DACE] pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FAF3EF] text-sm text-[#D98263] font-bold border border-[#D98263]/30">
                  5
                </span>
                <div>
                  <h2 className="text-lg font-serif font-bold text-[#172321]">Pricing & Live Profit Estimator</h2>
                  <p className="text-xs text-[#172321]/60">
                    Set your buyer pricing and enter confidential direct costs to see your live profit per unit
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-[#172321] text-white px-2.5 py-0.5 text-xs font-semibold">
                Private Ledger
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field
                label="Customer Selling Price (₹)"
                required
                error={fields.pricePaise}
                hint="Price the buyer pays (all taxes inclusive)"
              >
                <Input
                  required
                  inputMode="decimal"
                  value={form.priceRupees}
                  onChange={(event) => setForm({ ...form, priceRupees: event.target.value })}
                  placeholder="450"
                  className="font-bold text-base text-[#172321]"
                />
              </Field>

              <Field label="Original Compare-At Price (₹ MRP)" hint="Optional strike-through retail price">
                <Input
                  inputMode="decimal"
                  value={form.compareAtRupees}
                  onChange={(event) => setForm({ ...form, compareAtRupees: event.target.value })}
                  placeholder="550"
                />
              </Field>

              <Field
                label="Your Direct Production Cost (COGS, ₹)"
                hint="Private to you: raw materials, plucking, weaving, or crafting cost"
              >
                <Input
                  inputMode="decimal"
                  value={form.estimatedCostRupees}
                  onChange={(event) => setForm({ ...form, estimatedCostRupees: event.target.value })}
                  placeholder="180"
                />
              </Field>

              <Field
                label="Packaging & Box Cost (₹)"
                hint="Private to you: cartons, cushioning liners, seal tape"
              >
                <Input
                  inputMode="decimal"
                  value={form.packagingCostRupees}
                  onChange={(event) => setForm({ ...form, packagingCostRupees: event.target.value })}
                  placeholder="30"
                />
              </Field>
            </div>

            {/* Live Interactive Unit Economics Card */}
            <div className="mt-6 rounded-2xl border border-[#D98263]/30 bg-gradient-to-br from-[#FAF7F2] to-[#FAF3EF] p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#D98263]/20 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-[#172321]">
                  Live Unit Margin & Profit Calculator
                </span>
                <span className="text-[11px] font-medium text-[#66745A]">
                  🔒 Completely confidential — Never shown to customers
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 text-center">
                <div className="rounded-xl border border-[#E4DACE] bg-white p-3 shadow-xs">
                  <p className="text-[10px] uppercase font-semibold text-[#172321]/50">Selling Price</p>
                  <p className="mt-1 font-serif text-lg font-bold text-[#172321]">
                    ₹{form.priceRupees || '0'}
                  </p>
                </div>

                <div className="rounded-xl border border-[#E4DACE] bg-white p-3 shadow-xs">
                  <p className="text-[10px] uppercase font-semibold text-[#172321]/50">Marketplace Share ({percentFromBp(commissionBp)})</p>
                  <p className="mt-1 font-serif text-lg font-bold text-[#172321]/70">
                    −₹{commissionNum.toFixed(2)}
                  </p>
                </div>

                <div className="rounded-xl border border-[#E4DACE] bg-white p-3 shadow-xs">
                  <p className="text-[10px] uppercase font-semibold text-[#172321]/50">Your Direct Costs</p>
                  <p className="mt-1 font-serif text-lg font-bold text-[#172321]/70">
                    −₹{(cogsNum + pkgNum).toFixed(2)}
                  </p>
                </div>

                <div className="rounded-xl border border-[#D98263]/50 bg-white p-3 shadow-xs">
                  <p className="text-[10px] uppercase font-bold text-[#D98263]">Est. Profit / Unit</p>
                  <p className="mt-1 font-serif text-xl font-bold text-[#D98263]">
                    ₹{unitProfitNum.toFixed(2)}
                  </p>
                  <p className="text-[10px] font-bold text-[#66745A] mt-0.5">
                    {unitMarginPercent}% margin
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* =========================================================================
            STEP 6: Inventory Stock & Dispatch Settings
            ========================================================================= */}
        {(activeStep === 'all' || activeStep === 6) && (
          <section className="rounded-2xl border border-[#E4DACE] bg-white p-5 sm:p-7 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E4DACE] pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FAF3EF] text-sm text-[#D98263] font-bold border border-[#D98263]/30">
                  6
                </span>
                <div>
                  <h2 className="text-lg font-serif font-bold text-[#172321]">Inventory & Stock Management</h2>
                  <p className="text-xs text-[#172321]/60">
                    Keep stock honest. Only list units you have ready to dispatch.
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-[#172321]/10 px-2.5 py-0.5 text-xs font-semibold text-[#172321]">
                Stock Control
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <Field label="Available Physical Stock" required hint="Ready for immediate shipment">
                <Input
                  required
                  inputMode="numeric"
                  value={inventory.quantity}
                  onChange={(event) =>
                    setInventory({ ...inventory, quantity: event.target.value.replace(/\D/g, '') })
                  }
                  placeholder="10"
                />
              </Field>

              <Field label="Low Stock Alert Threshold" hint="Get notified when stock drops below this number">
                <Input
                  inputMode="numeric"
                  value={inventory.lowStockThreshold}
                  onChange={(event) =>
                    setInventory({ ...inventory, lowStockThreshold: event.target.value.replace(/\D/g, '') })
                  }
                  placeholder="3"
                />
              </Field>

              <Field label="Inventory Movement Note" hint="e.g. Fresh autumn harvest plucking or New loom weave batch">
                <Input
                  value={inventory.note}
                  onChange={(event) => setInventory({ ...inventory, note: event.target.value })}
                  placeholder="e.g. Workshop batch 2026"
                />
              </Field>
            </div>
          </section>
        )}

        {/* =========================================================================
            STEP 7: Category-specific publication information
            ========================================================================= */}
        {complianceGroup !== 'general' && (activeStep === 'all' || activeStep === 7) && (
          <section className="rounded-2xl border border-[#E4DACE] bg-white p-5 sm:p-7 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E4DACE] pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FAF3EF] text-sm text-[#D98263] font-bold border border-[#D98263]/30">
                  7
                </span>
                <div>
                  <h2 className="text-lg font-serif font-bold text-[#172321]">
                    {complianceGuide.label}
                  </h2>
                  <p className="text-xs text-[#172321]/60">{complianceGuide.summary}</p>
                </div>
              </div>
              <span className="rounded-full bg-amber-100 text-amber-900 px-2.5 py-0.5 text-xs font-semibold">
                Reviewed before publication
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {complianceGroup === 'food' ? (
                <>
                  <Field
                    label="FSSAI registration / licence number"
                    required
                    error={fields['compliance.fssaiLicense']}
                    hint="Leave blank only if your verified application already records this licence"
                  >
                    <Input
                      value={form.compliance.fssaiLicense}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          compliance: { ...form.compliance, fssaiLicense: event.target.value.replace(/\s/g, '') },
                        })
                      }
                      placeholder="e.g. 10921011000123"
                      maxLength={30}
                    />
                  </Field>

                  <Field label="Shelf life / best before" required error={fields['compliance.shelfLife']} hint="e.g. 12 months from packing">
                    <Input
                      value={form.compliance.shelfLife}
                      onChange={(event) =>
                        setForm({ ...form, compliance: { ...form.compliance, shelfLife: event.target.value } })
                      }
                      placeholder="e.g. 9 months from packing"
                      maxLength={120}
                    />
                  </Field>

                  <Field label="Ingredients" required className="sm:col-span-2" error={fields['compliance.ingredients']}>
                    <Textarea
                      rows={3}
                      value={form.compliance.ingredients}
                      onChange={(event) =>
                        setForm({ ...form, compliance: { ...form.compliance, ingredients: event.target.value } })
                      }
                      placeholder="e.g. Wild Himalayan Apples, Raw Cane Sugar, Natural Fruit Pectin, Lemon Juice"
                      maxLength={1000}
                    />
                  </Field>

                  <Field
                    label="Allergen declaration"
                    required
                    className="sm:col-span-2"
                    error={fields['compliance.allergenInfo']}
                    hint="Declare allergens, or state that none are known"
                  >
                    <Input
                      value={form.compliance.allergenInfo}
                      onChange={(event) =>
                        setForm({ ...form, compliance: { ...form.compliance, allergenInfo: event.target.value } })
                      }
                      placeholder="e.g. Contains tree nuts. Packed in a facility that also handles milk."
                      maxLength={300}
                    />
                  </Field>

                  <Field label="Batch number (if assigned)">
                    <Input
                      value={form.compliance.batchNumber}
                      onChange={(event) =>
                        setForm({ ...form, compliance: { ...form.compliance, batchNumber: event.target.value } })
                      }
                      placeholder="e.g. B-2026-10"
                      maxLength={80}
                    />
                  </Field>

                  <Field label="Storage guidance" required error={fields['compliance.storage']}>
                    <Input
                      value={form.compliance.storage}
                      onChange={(event) =>
                        setForm({ ...form, compliance: { ...form.compliance, storage: event.target.value } })
                      }
                      placeholder="e.g. Store in a cool dry place away from direct sunlight."
                      maxLength={300}
                    />
                  </Field>
                </>
              ) : null}

              {complianceGroup !== 'food' ? (
                <div className="sm:col-span-2 border border-[#E4DACE] bg-[#FAF7F2] p-4">
                  <p className="text-sm font-medium text-[#172321]">These details come from the provenance step</p>
                  <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[#66745A]">
                    <li>
                      Material and composition:{' '}
                      {form.materials.trim() ? <span className="text-[#172321]">{form.materials.trim()}</span> : 'not recorded yet'}
                    </li>
                    {complianceGroup === 'clothing' ? (
                      <>
                        <li>
                          Size or measurements:{' '}
                          {form.dimensions.trim() ? (
                            <span className="text-[#172321]">{form.dimensions.trim()}</span>
                          ) : (
                            'not recorded yet'
                          )}
                        </li>
                        <li>
                          Care instructions:{' '}
                          {form.careInstructions.trim() ? (
                            <span className="text-[#172321]">{form.careInstructions.trim()}</span>
                          ) : (
                            'not recorded yet'
                          )}
                        </li>
                      </>
                    ) : null}
                  </ul>
                  <p className="mt-3 text-xs leading-relaxed text-[#66745A]">
                    Edit these in the provenance step. They are required before this listing can be submitted for
                    review.
                  </p>
                  <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => setActiveStep(3)}>
                    Edit provenance details
                  </Button>
                </div>
              ) : null}
            </div>

            <p className="mt-4 rounded-xl border border-[#E4DACE] bg-[#FAF7F2] p-3 text-xs leading-relaxed text-[#66745A]">
              This information is checked by a reviewer before the listing can appear in the shop. It is not a
              substitute for your own legal or food-safety obligations.
            </p>
          </section>
        )}

        {/* =========================================================================
            BOTTOM ACTION BAR & CONFIRMATION
            ========================================================================= */}
        <div className="rounded-2xl border border-[#E4DACE] bg-white p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#172321]">
              Ready to {isNew ? 'publish your product draft' : 'update your catalogue listing'}?
            </p>
            <p className="text-xs text-[#172321]/60">
              {pendingPhotos.length > 0
                ? `${pendingPhotos.length} photograph${pendingPhotos.length === 1 ? '' : 's'} queued for immediate upload.`
                : 'All changes are automatically validated against marketplace guidelines.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <LinkButton to="/seller/products" variant="secondary" size="md">
              Cancel
            </LinkButton>
            <Button
              size="md"
              variant="secondary"
              loading={saving}
              disabled={inReview}
              onClick={() => void saveProduct(false)}
            >
              {isNew ? 'Save Draft' : 'Save Changes'}
            </Button>
            <Button
              size="md"
              loading={saving}
              disabled={inReview}
              onClick={() => void saveProduct(true)}
              className="bg-[#D98263] text-white hover:bg-[#c26e50] border-transparent font-semibold shadow-xs"
            >
              ✓ {isNew ? 'Create & Submit for Review' : 'Save & Submit for Review'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SellerOrderRow {
  id: string;
  reference: string;
  orderNumber: string;
  status: string;
  totalPaise: number;
  earningPaise: number;
  commissionPaise: number;
  createdAt: string;
  dispatchBy: string | null;
  itemCount: number;
  customerName: string;
  destination: string;
}

export function SellerOrdersPage() {
  const [status, setStatus] = useState('');
  const orders = useQuery({
    queryKey: ['seller-orders', status],
    queryFn: () => api<{ orders: SellerOrderRow[] }>(`/seller/orders${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  });
  return (
    <div>
      <PageHeader
        eyebrow="Fulfilment & Dispatch"
        title="Customer Orders"
        lede="Receive genuine customer orders, accept and pack items, record carrier tracking, and track delivery progress."
      />

      {/* Status Filter Tabs */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {[
          { label: 'All Orders', value: '' },
          { label: 'Awaiting Action', value: 'pending' },
          { label: 'Accepted', value: 'confirmed' },
          { label: 'Packed', value: 'packed' },
          { label: 'Shipped', value: 'shipped' },
          { label: 'Delivered', value: 'delivered' },
          { label: 'Cancelled', value: 'cancelled' },
        ].map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatus(tab.value)}
            className={`rounded-full px-3.5 py-1 text-xs font-medium transition-all ${
              status === tab.value
                ? 'bg-[#172321] text-white shadow-xs'
                : 'bg-white text-[#172321]/70 hover:bg-[#FAF7F2] hover:text-[#172321] border border-[#E4DACE]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {orders.isLoading ? <LoadingBlock rows={4} /> : null}
        {orders.isError ? <ErrorState onRetry={() => void orders.refetch()} /> : null}
        {orders.data?.orders.length === 0 ? <EmptyState title="No orders in this view" body="Paid orders from customers will appear here for confirmation." /> : null}
        {orders.data?.orders.length ? (
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="min-w-full text-left text-[12.5px]">
              <thead className="border-b border-line bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Earning</th>
                  <th className="px-4 py-3">Dispatch by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.data.orders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-4 py-4">
                      <Link to={`/seller/orders/${order.id}`} className="font-medium text-forest hover:text-terra">{order.reference}</Link>
                      <p className="text-[10.5px] text-muted">{order.orderNumber} · {order.itemCount} item{order.itemCount === 1 ? '' : 's'}</p>
                    </td>
                    <td className="px-4 py-4">{order.customerName}<p className="text-[10.5px] text-muted">{order.destination}</p></td>
                    <td className="px-4 py-4"><StatusBadge status={order.status} label={sellerOrderStatusLabel(order.status)} /></td>
                    <td className="px-4 py-4">{formatINR(order.totalPaise)}</td>
                    <td className="px-4 py-4">{formatINR(order.earningPaise)}</td>
                    <td className="px-4 py-4">{order.dispatchBy ? formatDate(order.dispatchBy) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface SellerOrderDetail {
  order: {
    id: string;
    reference: string;
    orderNumber: string;
    status: string;
    createdAt: string;
    dispatchBy: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
    subtotalPaise: number;
    discountPaise: number;
    shippingPaise: number;
    taxPaise: number;
    totalPaise: number;
    commissionPaise: number;
    commissionRateBp: number;
    earningPaise: number;
    customerNote: string | null;
    seller?: { businessName: string | null; logoUrl: string | null; region: string | null; village: string | null };
    address: { fullName: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string };
    items: { id: string; name: string; sku: string; quantity: number; unitPricePaise: number; lineSubtotalPaise: number; status: string; imageUrl: string | null }[];
    shipment: { carrier: string; trackingNumber: string; trackingUrl: string | null; status: string; shippedAt: string; deliveredAt: string | null; events: { status: string; description: string | null; occurredAt: string }[] } | null;
    commissionNote: string;
  };
}

export function SellerOrderDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [shipOpen, setShipOpen] = useState(false);
  const [slipOpen, setSlipOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('Out of stock / harvest damaged');
  const [rejectDetails, setRejectDetails] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const order = useQuery({
    queryKey: ['seller-order', id],
    queryFn: () => api<SellerOrderDetail>(`/seller/orders/${id}`),
    enabled: Boolean(id),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['seller-order', id] });
    await queryClient.invalidateQueries({ queryKey: ['seller-orders'] });
    await queryClient.invalidateQueries({ queryKey: ['seller-dashboard'] });
  };

  const act = async (action: string, customNote?: string) => {
    setBusy(true);
    try {
      const finalNote = customNote !== undefined ? customNote : note;
      await api(`/seller/orders/${id}/action`, {
        method: 'POST',
        body:
          action === 'ship'
            ? { action, carrier, trackingNumber, trackingUrl: trackingUrl || undefined, note: finalNote || undefined }
            : { action, note: finalNote || undefined },
      });
      setShipOpen(false);
      setRejectOpen(false);
      setNote('');
      setRejectDetails('');
      toast.push(action === 'accept' || action === 'confirm' ? 'Order accepted.' : action === 'reject' || action === 'cancel' ? 'Order rejected & stock restored.' : 'Order updated.');
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (order.isLoading) return <LoadingBlock rows={4} />;
  if (order.isError || !order.data) return <ErrorState title="Order not found" body="This seller order may not belong to your account." onRetry={() => void order.refetch()} />;
  const data = order.data.order;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Seller order"
        title={data.reference}
        lede={`Marketplace order ${data.orderNumber} · placed ${formatDateTime(data.createdAt)}`}
        actions={<StatusBadge status={data.status} label={sellerOrderStatusLabel(data.status)} />}
      />
      <div className="flex flex-wrap items-center gap-2">
        {data.status === 'pending' ? (
          <>
            <Button onClick={() => void act('accept')} loading={busy} className="bg-[#66745A] hover:bg-[#525E48] text-white">
              ✓ Accept Order
            </Button>
            <Button variant="danger" onClick={() => setRejectOpen(true)}>
              ✕ Reject Order
            </Button>
          </>
        ) : null}
        {data.status === 'confirmed' ? (
          <>
            <Button variant="secondary" onClick={() => void act('pack')} loading={busy}>
              Mark Packed
            </Button>
            <Button onClick={() => setShipOpen(true)}>
              Dispatch with Tracking
            </Button>
            <Button variant="ghost" onClick={() => setRejectOpen(true)} className="text-red-700 hover:text-red-800">
              Cancel Order
            </Button>
          </>
        ) : null}
        {data.status === 'packed' ? (
          <>
            <Button onClick={() => setShipOpen(true)}>
              Dispatch with Tracking
            </Button>
            <Button variant="ghost" onClick={() => setRejectOpen(true)} className="text-red-700 hover:text-red-800">
              Cancel Order
            </Button>
          </>
        ) : null}
        {data.status === 'shipped' ? (
          <Button onClick={() => void act('deliver')} loading={busy}>
            Mark Delivered
          </Button>
        ) : null}
        <Button
          variant="secondary"
          onClick={() => setSlipOpen(true)}
          className="inline-flex items-center gap-1.5"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          <span>Print Packing Slip</span>
        </Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <section className="border border-line bg-surface">
            <div className="border-b border-line px-5 py-4"><h2 className="text-lg">Items</h2></div>
            <ul className="divide-y divide-line">
              {data.items.map((item) => (
                <li key={item.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="h-14 w-14 shrink-0 overflow-hidden bg-sand/40">{item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" /> : null}</div>
                  <div className="flex-1">
                    <p className="text-sm text-ink">{item.name}</p>
                    <p className="text-[11px] text-muted">SKU {item.sku} · Qty {item.quantity} · {formatINR(item.unitPricePaise)} each</p>
                  </div>
                  <p className="text-sm">{formatINR(item.lineSubtotalPaise)}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className="border border-line bg-surface p-5">
            <h2 className="text-lg">Payment & commission</h2>
            <dl className="mt-4 space-y-2 text-[12.5px]">
              <div className="flex justify-between"><dt className="text-muted">Product value</dt><dd>{formatINR(data.subtotalPaise)}</dd></div>
              {data.discountPaise ? <div className="flex justify-between"><dt className="text-muted">Discount</dt><dd>−{formatINR(data.discountPaise)}</dd></div> : null}
              <div className="flex justify-between"><dt className="text-muted">Shipping (marketplace)</dt><dd>{formatINR(data.shippingPaise)}</dd></div>
              {data.taxPaise ? <div className="flex justify-between"><dt className="text-muted">Tax included</dt><dd>{formatINR(data.taxPaise)}</dd></div> : null}
              <div className="flex justify-between border-t border-line pt-2"><dt className="text-muted">Buyer paid</dt><dd>{formatINR(data.totalPaise)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Commission ({percentFromBp(data.commissionRateBp)})</dt><dd>−{formatINR(data.commissionPaise)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 font-medium"><dt>Your earning</dt><dd>{formatINR(data.earningPaise)}</dd></div>
            </dl>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">{data.commissionNote}</p>
          </section>
          {data.shipment ? (
            <section className="border border-line bg-surface p-5">
              <h2 className="text-lg">Shipment</h2>
              <p className="mt-2 text-sm">{data.shipment.carrier} · {data.shipment.trackingNumber}</p>
              <p className="text-[11px] text-muted">Shipped {formatDate(data.shipment.shippedAt)}{data.shipment.deliveredAt ? ` · delivered ${formatDate(data.shipment.deliveredAt)}` : ''}</p>
              {data.shipment.trackingUrl ? <a href={data.shipment.trackingUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-forest underline underline-offset-2">Open tracking</a> : null}
              <ol className="mt-3 space-y-1 text-[11.5px] text-muted">
                {data.shipment.events.map((event, index) => <li key={`${event.status}-${index}`}>{formatDate(event.occurredAt)} · {event.status.replaceAll('_', ' ')}{event.description ? ` — ${event.description}` : ''}</li>)}
              </ol>
            </section>
          ) : null}
        </div>
        <aside className="space-y-5">
          <section className="border border-line bg-surface p-5">
            <h2 className="text-lg">Ship to</h2>
            <address className="mt-3 text-[12.5px] not-italic leading-relaxed text-ink/75">
              {data.address.fullName}<br />
              {data.address.line1}<br />
              {data.address.line2 ? <>{data.address.line2}<br /></> : null}
              {data.address.city}, {data.address.state} {data.address.pincode}<br />
              {data.address.phone}
            </address>
          </section>
          {data.customerNote ? (
            <section className="border border-line bg-[#fbf5e6] p-5">
              <h2 className="text-lg">Customer note</h2>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink/75">{data.customerNote}</p>
            </section>
          ) : null}
          <section className="border border-line bg-paper p-5 text-[11.5px] leading-relaxed text-muted">
            <p className="font-medium text-ink">Dispatch checklist</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>Match the SKU and quantity before packing.</li>
              <li>Use protective packaging appropriate to the item.</li>
              <li>Add the real carrier and tracking number, not a placeholder.</li>
              <li>Keep the dispatch evidence until the return window closes.</li>
            </ul>
          </section>
        </aside>
      </div>

      {/* Carrier Tracking Modal */}
      <Modal
        open={shipOpen}
        onClose={() => setShipOpen(false)}
        title="Dispatch this shipment"
        footer={<><Button variant="ghost" onClick={() => setShipOpen(false)}>Cancel</Button><Button loading={busy} onClick={() => void act('ship')}>Record dispatch</Button></>}
      >
        <div className="space-y-4">
          <Alert tone="info">This build does not create a carrier label. Enter the carrier and tracking reference from your own dispatch process.</Alert>
          <Field label="Carrier" required><Input value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder="e.g. India Post, Delhivery" /></Field>
          <Field label="Tracking number" required><Input value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} /></Field>
          <Field label="Tracking URL" hint="Optional"><Input type="url" value={trackingUrl} onChange={(event) => setTrackingUrl(event.target.value)} placeholder="https://" /></Field>
          <Field label="Internal note" hint="Optional"><Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
        </div>
      </Modal>

      {/* Printable Packing Slip Modal */}
      <Modal
        open={slipOpen}
        onClose={() => setSlipOpen(false)}
        title="Printable Packing Slip & Artisan Dispatch Note"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSlipOpen(false)}>Close</Button>
            <Button variant="terra" onClick={() => window.print()}>Print Packing Slip</Button>
          </>
        }
      >
        <div className="space-y-6 text-[#172321] print:text-black">
          {/* Slip Header */}
          <div className="border-b border-[#E4DACE] pb-4 flex items-center justify-between">
            <div>
              <p className="font-serif text-xl font-bold tracking-wide text-[#172321]">DEAR HILLS</p>
              <p className="text-[10px] uppercase tracking-widest text-[#66745A] font-semibold">Artisan Dispatch & Packing Slip</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-bold text-[#172321]">{data.reference}</p>
              <p className="text-[11px] text-[#172321]/60">Order #{data.orderNumber}</p>
            </div>
          </div>

          {/* Fulfilment Meta */}
          <div className="grid grid-cols-2 gap-4 text-xs border border-[#E4DACE] p-4 bg-[#FAF7F2] rounded-lg">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#66745A] font-bold">Fulfilled By</p>
              <p className="mt-1 font-medium text-sm text-[#172321]">{data.seller?.businessName ?? 'Seller'}</p>
              <p className="text-[#172321]/70">
                {[data.seller?.village, data.seller?.region].filter(Boolean).join(', ') || 'Location not set'}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#66745A] font-bold">Ship To Customer</p>
              <p className="mt-1 font-medium text-sm text-[#172321]">{data.address.fullName}</p>
              <p className="text-[#172321]/70">{data.address.line1}{data.address.line2 ? `, ${data.address.line2}` : ''}</p>
              <p className="text-[#172321]/70">{data.address.city}, {data.address.state} — {data.address.pincode}</p>
              <p className="text-[#172321]/70 font-mono">Contact: {data.address.phone}</p>
            </div>
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto border border-[#E4DACE] rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF7F2] border-b border-[#E4DACE] text-[10px] uppercase tracking-wider text-[#172321]/60">
                <tr>
                  <th className="py-2.5 px-3">Item Description</th>
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3 text-center">Qty</th>
                  <th className="py-2.5 px-3 text-right">Unit Price</th>
                  <th className="py-2.5 px-3 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4DACE]">
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5 px-3 font-medium text-[#172321]">{item.name}</td>
                    <td className="py-2.5 px-3 text-[#172321]/60 font-mono text-[11px]">{item.sku}</td>
                    <td className="py-2.5 px-3 text-center font-bold">{item.quantity}</td>
                    <td className="py-2.5 px-3 text-right">{formatINR(item.unitPricePaise)}</td>
                    <td className="py-2.5 px-3 text-right font-medium">{formatINR(item.lineSubtotalPaise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-[#E4DACE] bg-[#FAF7F2] font-semibold text-xs">
                <tr>
                  <td colSpan={4} className="py-2 px-3 text-right">Total Shipment Value:</td>
                  <td className="py-2 px-3 text-right text-[#D98263] font-bold">{formatINR(data.subtotalPaise)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Dispatch checklist (instructions, not claims) */}
          <div className="border border-[#66745A]/30 bg-[#66745A]/5 p-4 rounded-lg text-xs space-y-2">
            <p className="font-semibold text-[#172321] uppercase tracking-wide text-[10.5px]">Before dispatch</p>
            <div className="grid sm:grid-cols-3 gap-2 text-[11px] text-[#172321]/80">
              <div className="flex items-center gap-2">
                <span className="font-bold">☐</span>
                <span>Match every SKU and quantity</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold">☐</span>
                <span>Pack to protect the item in transit</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold">☐</span>
                <span>Record the real carrier and tracking number</span>
              </div>
            </div>
          </div>

          <div className="text-center pt-2 text-[10px] text-[#172321]/50 border-t border-[#E4DACE]">
            <p>Thank you for supporting makers across Himachal Pradesh.</p>
            <p className="mt-0.5">Need help with this delivery? Contact marketplace support.</p>
          </div>
        </div>
      </Modal>

      {/* Reject / Cancel Order Modal with Reason */}
      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject or Cancel Order"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              Keep Order
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => {
                const combinedNote = `${rejectReason}${rejectDetails ? ': ' + rejectDetails.trim() : ''}`;
                void act('reject', combinedNote);
              }}
            >
              Confirm Cancellation & Release Stock
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="warning">
            Rejecting or cancelling this order will immediately restore all reserved units back to your active inventory, update your seller metrics, and inform the customer.
          </Alert>
          <Field label="Cancellation / Rejection Reason" required>
            <Select value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}>
              <option value="Out of stock / harvest damaged">Out of stock / harvest damaged</option>
              <option value="Quality check or craft inspection failed">Quality check or craft inspection failed</option>
              <option value="Courier transit unserviceable for this pincode">Courier transit unserviceable for this pincode</option>
              <option value="Severe weather / mountain road blockage">Severe weather / mountain road blockage</option>
              <option value="Customer requested cancellation prior to packing">Customer requested cancellation prior to packing</option>
              <option value="Other verified operational constraint">Other verified operational constraint</option>
            </Select>
          </Field>
          <Field label="Additional Note / Context" hint="Recorded in the order status event history">
            <Textarea
              rows={2}
              value={rejectDetails}
              onChange={(e) => setRejectDetails(e.target.value)}
              placeholder="e.g. Fresh autumn apple crop batch was damaged during transit from Kotgarh."
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

interface EarningsResponse {
  entries: { id: string; type: string; amountPaise: number; status: string; reference: string; note: string | null; availableAt: string | null; createdAt: string; orderNumber: string | null }[];
  totals: { pending: number; eligible: number; settled: number; reversed: number };
  commissions: { sellerOrderId: string; basisPaise: number; rateBp: number; amountPaise: number; createdAt: string }[];
  settlements: { id: string; reference: string; periodStart: string; periodEnd: string; netPaise: number; status: string; paidAt: string | null; providerReference: string | null }[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  commissionNote: string;
}

export function SellerEarningsPage() {
  const [page, setPage] = useState(1);
  const earnings = useQuery({
    queryKey: ['seller-earnings', page],
    queryFn: () => api<EarningsResponse>(`/seller/earnings?page=${page}`),
  });
  if (earnings.isLoading) return <LoadingBlock rows={4} />;
  if (earnings.isError || !earnings.data) return <ErrorState onRetry={() => void earnings.refetch()} />;
  const data = earnings.data;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Money"
        title="Earnings & settlements"
        lede="A ledger, not a promise. Entries become eligible after delivery and the 7-day return window. A settlement is marked paid only with a recorded bank/UPI reference."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pending" value={formatINR(data.totals.pending)} note="Not yet available" />
        <Stat label="Eligible" value={formatINR(data.totals.eligible)} note="Ready for settlement review" tone="accent" />
        <Stat label="Settled" value={formatINR(data.totals.settled)} note="Recorded payouts" />
        <Stat label="Reversed" value={formatINR(data.totals.reversed)} note="Refunds and adjustments" tone="warning" />
      </div>
      <Alert tone="info" title="Manual payouts only">
        This deployment does not automate marketplace payouts. The operator reviews eligible entries, creates a settlement
        batch, transfers funds through the business bank account or UPI, and records the reference. No payout is implied until
        that reference exists.
      </Alert>
      <section>
        <h2 className="text-xl">Settlement batches</h2>
        {data.settlements.length ? (
          <div className="mt-3 overflow-x-auto border border-line bg-surface">
            <table className="min-w-full text-left text-[12.5px]">
              <thead className="border-b border-line bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
                <tr><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Period</th><th className="px-4 py-3">Net</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Payment reference</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.settlements.map((settlement) => (
                  <tr key={settlement.id}>
                    <td className="px-4 py-3 text-forest">{settlement.reference}</td>
                    <td className="px-4 py-3">{formatDate(settlement.periodStart)} – {formatDate(settlement.periodEnd)}</td>
                    <td className="px-4 py-3">{formatINR(settlement.netPaise)}</td>
                    <td className="px-4 py-3"><StatusBadge status={settlement.status} /></td>
                    <td className="px-4 py-3 text-muted">{settlement.providerReference ?? (settlement.status === 'paid' ? 'Recorded' : '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-3 border border-dashed border-sand px-4 py-8 text-center text-sm text-muted">No settlement batches yet.</p>}
      </section>
      <section>
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-xl">Ledger entries</h2>
          <p className="text-[11px] text-muted">{data.pagination.total} entries</p>
        </div>
        {data.entries.length ? (
          <div className="mt-3 overflow-x-auto border border-line bg-surface">
            <table className="min-w-full text-left text-[12.5px]">
              <thead className="border-b border-line bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
                <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Amount</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 text-muted">{formatDate(entry.createdAt)}</td>
                    <td className="px-4 py-3">{humanise(entry.type)}</td>
                    <td className="px-4 py-3"><span className="text-forest">{entry.reference}</span>{entry.orderNumber ? <p className="text-[10.5px] text-muted">{entry.orderNumber}</p> : null}</td>
                    <td className="px-4 py-3"><StatusBadge status={entry.status} /></td>
                    <td className="px-4 py-3 text-right">{formatINR(entry.amountPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-3 border border-dashed border-sand px-4 py-8 text-center text-sm text-muted">No ledger entries yet.</p>}
        <Pagination page={page} totalPages={data.pagination.totalPages} onChange={setPage} />
      </section>
      <section className="border border-line bg-surface p-5">
        <h2 className="text-xl">Commission entries</h2>
        <p className="mt-1 text-[11px] text-muted">{data.commissionNote}</p>
        {data.commissions.length ? (
          <ul className="mt-4 divide-y divide-line text-[12.5px]">
            {data.commissions.map((commission) => (
              <li key={`${commission.sellerOrderId}-${commission.createdAt}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="text-muted">{formatDate(commission.createdAt)} · basis {formatINR(commission.basisPaise)} · {percentFromBp(commission.rateBp)}</span>
                <span>{formatINR(commission.amountPaise)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-4 text-sm text-muted">No commission entries yet.</p>}
      </section>
    </div>
  );
}

interface RequestsResponse {
  returns: { id: string; seller_order_id: string; reason: string; description: string | null; status: string; created_at: string; order_number: string; item_name: string | null }[];
  cancellations: { id: string; seller_order_id: string; reason: string; status: string; created_at: string; order_number: string }[];
}

export function SellerRequestsPage() {
  const requests = useQuery({ queryKey: ['seller-requests'], queryFn: () => api<RequestsResponse>('/seller/requests') });
  if (requests.isLoading) return <LoadingBlock rows={3} />;
  if (requests.isError || !requests.data) return <ErrorState onRetry={() => void requests.refetch()} />;
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="After-sales"
        title="Returns & cancellation requests"
        lede="The marketplace team decides return and cancellation requests. Contact support if evidence or a pickup address is needed."
      />
      <section>
        <h2 className="text-xl">Returns</h2>
        {requests.data.returns.length ? (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {requests.data.returns.map((request) => (
              <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div>
                  <p className="text-[13px] font-medium text-forest">{request.order_number} · {request.item_name ?? 'Item'}</p>
                  <p className="mt-1 text-[12px] text-ink/70">{request.reason}</p>
                  {request.description ? <p className="mt-1 text-[11.5px] text-muted">{request.description}</p> : null}
                  <p className="text-[11px] text-muted">{formatDate(request.created_at)}</p>
                </div>
                <StatusBadge status={request.status} />
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 border border-dashed border-sand px-4 py-8 text-center text-sm text-muted">No return requests.</p>}
      </section>
      <section>
        <h2 className="text-xl">Cancellations</h2>
        {requests.data.cancellations.length ? (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {requests.data.cancellations.map((request) => (
              <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div>
                  <p className="text-[13px] font-medium text-forest">{request.order_number}</p>
                  <p className="mt-1 text-[12px] text-ink/70">{request.reason}</p>
                  <p className="text-[11px] text-muted">{formatDate(request.created_at)}</p>
                </div>
                <StatusBadge status={request.status} />
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 border border-dashed border-sand px-4 py-8 text-center text-sm text-muted">No cancellation requests.</p>}
      </section>
    </div>
  );
}

export function SellerProfilePage() {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const application = useQuery({ queryKey: ['seller-application'], queryFn: () => api<SellerApplicationResponse>('/seller/application') });
  const [form, setForm] = useState({ businessName: '', tagline: '', story: '', region: '', village: '', line1: '', line2: '', city: '', state: 'Himachal Pradesh', pincode: '' });
  const [prefilledSellerId, setPrefilledSellerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [docType, setDocType] = useState('id_proof');
  const [uploading, setUploading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<'logo' | 'cover' | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const savedSeller = application.data?.seller;
  if (savedSeller && prefilledSellerId !== savedSeller.id) {
    setPrefilledSellerId(savedSeller.id);
    setForm({
      businessName: savedSeller.businessName,
      tagline: savedSeller.tagline ?? '',
      story: savedSeller.story ?? '',
      region: savedSeller.region ?? '',
      village: savedSeller.village ?? '',
      line1: savedSeller.operatingAddress?.line1 ?? '',
      line2: savedSeller.operatingAddress?.line2 ?? '',
      city: savedSeller.operatingAddress?.city ?? '',
      state: savedSeller.operatingAddress?.state ?? 'Himachal Pradesh',
      pincode: savedSeller.operatingAddress?.pincode ?? '',
    });
  }

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFields({});
    try {
      await api('/seller/profile', {
        method: 'PATCH',
        body: {
          businessName: form.businessName,
          tagline: form.tagline || undefined,
          story: form.story || undefined,
          region: form.region || undefined,
          village: form.village || undefined,
          operatingAddress: {
            line1: form.line1,
            line2: form.line2 || undefined,
            city: form.city,
            state: form.state,
            pincode: form.pincode,
          },
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['seller-application'] });
      toast.push('Store profile updated.');
    } catch (error) {
      setFields(errorFields(error));
      toast.push(errorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const input = formElement.elements.namedItem('document') as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      toast.push('Choose a document first.', 'error');
      return;
    }
    const data = new FormData();
    data.append('document', file);
    data.append('docType', docType);
    setUploading(true);
    try {
      await api('/seller/documents', { method: 'POST', body: data });
      await queryClient.invalidateQueries({ queryKey: ['seller-application'] });
      formElement.reset();
      toast.push('Document uploaded privately.');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setUploading(false);
    }
  };

  const uploadImage = async (kind: 'logo' | 'cover', file: File | undefined) => {
    if (!file) return;
    setUploadingImage(kind);
    const data = new FormData();
    data.append('image', file);
    try {
      await api(`/seller/profile/image/${kind}`, { method: 'POST', body: data });
      await queryClient.invalidateQueries({ queryKey: ['seller-application'] });
      await queryClient.invalidateQueries({ queryKey: ['seller-dashboard'] });
      toast.push(kind === 'logo' ? 'Store logo updated.' : 'Store cover updated.');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setUploadingImage(null);
    }
  };

  const removeImage = async (kind: 'logo' | 'cover') => {
    setUploadingImage(kind);
    try {
      await api(`/seller/profile/image/${kind}`, { method: 'DELETE' });
      await queryClient.invalidateQueries({ queryKey: ['seller-application'] });
      await queryClient.invalidateQueries({ queryKey: ['seller-dashboard'] });
      toast.push(kind === 'logo' ? 'Store logo removed.' : 'Store cover removed.');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setUploadingImage(null);
    }
  };

  if (application.isLoading) return <LoadingBlock rows={3} />;
  if (application.isError || !application.data) return <ErrorState onRetry={() => void application.refetch()} />;
  if (!savedSeller) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <ErrorState
          title="Seller profile not found"
          body="Start or resume your seller application before editing a storefront profile."
          onRetry={() => navigate('/seller/application')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Storefront"
        title="Store profile"
        lede="This information appears on your public maker page and listings. Keep claims accurate and up to date."
      />
      <section className="overflow-hidden border border-line bg-surface">
        <div className="relative h-40 bg-sand/40 sm:h-52">
          {savedSeller.coverUrl ? (
            <img src={savedSeller.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-[12px] text-muted">No cover image yet</div>
          )}
        </div>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <div className="-mt-12 h-20 w-20 shrink-0 overflow-hidden rounded-xl border-4 border-surface bg-forest text-paper shadow sm:-mt-14 sm:h-24 sm:w-24">
              {savedSeller.logoUrl ? (
                <img src={savedSeller.logoUrl} alt={`${savedSeller.businessName} logo`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-serif text-2xl">
                  {savedSeller.businessName.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <h2 className="text-xl">{savedSeller.businessName}</h2>
              <p className="text-[11px] text-muted">Shown on your public maker page at /makers/{savedSeller.slug}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 border border-line bg-paper px-3 py-2 text-[11px] font-medium text-ink hover:border-forest">
              {uploadingImage === 'logo' ? 'Uploading…' : savedSeller.logoUrl ? 'Replace logo' : 'Upload logo'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={uploadingImage !== null}
                onChange={(event) => {
                  void uploadImage('logo', event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 border border-line bg-paper px-3 py-2 text-[11px] font-medium text-ink hover:border-forest">
              {uploadingImage === 'cover' ? 'Uploading…' : savedSeller.coverUrl ? 'Replace cover' : 'Upload cover'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={uploadingImage !== null}
                onChange={(event) => {
                  void uploadImage('cover', event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </label>
            {savedSeller.logoUrl ? (
              <Button type="button" variant="ghost" size="sm" loading={uploadingImage === 'logo'} onClick={() => void removeImage('logo')}>
                Remove logo
              </Button>
            ) : null}
            {savedSeller.coverUrl ? (
              <Button type="button" variant="ghost" size="sm" loading={uploadingImage === 'cover'} onClick={() => void removeImage('cover')}>
                Remove cover
              </Button>
            ) : null}
          </div>
        </div>
        <p className="border-t border-line px-5 py-3 text-[11px] text-muted">
          JPEG, PNG or WebP up to 5 MB. Images are stored with your seller record and are not shared outside your public storefront.
        </p>
      </section>
      <form onSubmit={save} className="space-y-6">
        <section className="border border-line bg-surface p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business or maker name" required error={fields.businessName}>
              <Input required value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} />
            </Field>
            <Field label="Tagline"><Input maxLength={160} value={form.tagline} onChange={(event) => setForm({ ...form, tagline: event.target.value })} /></Field>
            <Field label="Region"><Input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} /></Field>
            <Field label="Village or town"><Input value={form.village} onChange={(event) => setForm({ ...form, village: event.target.value })} /></Field>
          </div>
          <Field label="Store story" className="mt-4" hint="Up to 3,000 characters">
            <Textarea rows={6} maxLength={3000} value={form.story} onChange={(event) => setForm({ ...form, story: event.target.value })} />
          </Field>
        </section>
        <section className="border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-xl">Operating address</h2>
          <p className="mt-1 text-[11px] text-muted">Used for seller records and pickup. It is not shown publicly.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Address line 1" required className="sm:col-span-2" error={fields.line1}><Input required value={form.line1} onChange={(event) => setForm({ ...form, line1: event.target.value })} /></Field>
            <Field label="Address line 2" className="sm:col-span-2"><Input value={form.line2} onChange={(event) => setForm({ ...form, line2: event.target.value })} /></Field>
            <Field label="City or town" required error={fields.city}><Input required value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></Field>
            <Field label="State" required error={fields.state}><Input required value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} /></Field>
            <Field label="PIN code" required error={fields.pincode}><Input required inputMode="numeric" value={form.pincode} onChange={(event) => setForm({ ...form, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) })} /></Field>
          </div>
        </section>
        <Button type="submit" loading={saving}>Save store profile</Button>
      </form>
      <section className="border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-xl">Verification documents</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">Private files. Only you and administrators can open them.</p>
        {application.data.documents.length ? (
          <ul className="mt-4 divide-y divide-line border-y border-line text-sm">
            {application.data.documents.map((document) => (
              <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-ink">{document.originalName}</p>
                  <p className="text-[11px] text-muted">{document.docType.replaceAll('_', ' ')} · {formatDate(document.uploadedAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={document.status} />
                  <a href={`/api/seller/documents/${document.id}/file`} target="_blank" rel="noreferrer" className="text-[11px] text-forest underline underline-offset-2">Open</a>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="mt-4 text-sm text-muted">No documents uploaded.</p>}
        <form onSubmit={upload} className="mt-5 grid gap-3 sm:grid-cols-[0.45fr_1fr_auto] sm:items-end">
          <Field label="Document type">
            <Select value={docType} onChange={(event) => setDocType(event.target.value)}>
              <option value="id_proof">Identity proof</option>
              <option value="business_registration">Business registration</option>
              <option value="gst_certificate">GST certificate</option>
              <option value="fssai">FSSAI registration</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="File"><Input type="file" name="document" accept=".pdf,.jpg,.jpeg,.png" required /></Field>
          <Button type="submit" variant="secondary" loading={uploading}>Upload</Button>
        </form>
      </section>
      <div className="border border-line bg-paper p-5 text-[11.5px] leading-relaxed text-muted">
        <p className="font-medium text-ink">Commission on file</p>
        <p className="mt-1">{application.data.commissionNote}</p>
        <p className="mt-2">Contact support if your business details, ownership or registrations change. Suspension can follow inaccurate verification information.</p>
      </div>
    </div>
  );
}
