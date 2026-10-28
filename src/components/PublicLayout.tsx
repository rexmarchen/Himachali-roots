import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { api, errorMessage } from '@/lib/api';
import { formatINR } from '@shared/types';
import { useAuth, useCartCount, useSiteContent } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { EcommerceSearchBar } from './EcommerceSearchBar';

const NAV = [
  { label: 'Shop', to: '/shop' },
  { label: 'Makers', to: '/makers' },
  { label: 'How we source', to: '/sourcing' },
  { label: 'Our Story', to: '/about' },
];

function Wordmark({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <Link to="/" className="group flex items-center gap-2.5 sm:gap-3" aria-label="DEAR HILLS home">
      <svg viewBox="0 0 48 48" className="h-8 w-8 sm:h-9 sm:w-9 lg:h-10 lg:w-10 xl:h-11 xl:w-11 shrink-0 drop-shadow-xs" aria-hidden>
        <rect width="48" height="48" rx="2" fill={light ? '#F7F3EB' : '#243D32'} />
        <path d="M9 35 20 15l5 11 4-6 9 15H9Z" fill={light ? '#243D32' : '#F7F3EB'} />
        <path d="M16 35 25 21l6 14H16Z" fill="#C77759" />
        <circle cx="35" cy="14" r="3.4" fill={light ? '#879483' : '#DCD2C2'} />
      </svg>
      <span className="leading-none">
        <span
          className={`block font-serif text-[17px] sm:text-[19px] lg:text-[22px] xl:text-[24px] tracking-[0.02em] transition-colors duration-200 ${
            light ? 'text-[#FFFEFA] group-hover:text-sand' : 'text-forest group-hover:text-terra'
          }`}
        >
          DEAR HILLS
        </span>
        {!compact ? (
          <span
            className={`mt-0.5 sm:mt-1 block text-[7.5px] sm:text-[8.5px] lg:text-[10px] xl:text-[10.5px] font-semibold uppercase tracking-[0.28em] transition-colors duration-200 ${
              light ? 'text-white/75' : 'text-muted'
            }`}
          >
            Himachal Pradesh
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function AccountMenu({ light = false }: { light?: boolean }) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKeyDown);
    const focusTimer = window.setTimeout(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }, 0);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  if (!user) {
    return (
      <Link
        to="/login"
        className={`inline-flex min-h-11 lg:min-h-12 items-center px-2.5 sm:px-3 text-[12.5px] sm:text-xs lg:text-[14px] font-medium transition-colors ${
          light ? 'text-white/90 hover:text-white' : 'text-ink hover:text-terra'
        }`}
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex min-h-11 lg:min-h-12 items-center gap-2 px-1.5 text-[12.5px] sm:text-xs lg:text-[14px] font-medium transition-colors ${
          light ? 'text-white hover:text-sand' : 'text-ink hover:text-terra'
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${user.fullName || user.email}`}
      >
        <span
          className={`flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full border text-[10px] sm:text-xs font-semibold ${
            light
              ? 'border-white/40 bg-white/20 text-white'
              : 'border-forest/20 bg-forest/[0.06] text-forest'
          }`}
        >
          {(user.fullName || user.email).slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-28 truncate lg:block">{user.fullName.split(' ')[0] || 'Account'}</span>
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-50 mt-1 w-60 border border-line bg-surface py-1 shadow-xl fade-up"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-[13px] font-medium text-ink">{user.fullName || 'Account'}</p>
            <p className="truncate text-[11px] text-muted">{user.email}</p>
          </div>
          <MenuLink to="/account" onClick={() => setOpen(false)}>
            Your account
          </MenuLink>
          <MenuLink to="/account/orders" onClick={() => setOpen(false)}>
            Orders &amp; returns
          </MenuLink>
          <MenuLink to="/account/wishlist" onClick={() => setOpen(false)}>
            Saved items
          </MenuLink>
          {user.roles.includes('seller') && !user.roles.includes('admin') ? (
            <MenuLink to="/seller" onClick={() => setOpen(false)}>
              Seller Studio
            </MenuLink>
          ) : null}
          {!user.roles.includes('seller') && !user.roles.includes('admin') ? (
            <MenuLink to="/sell" onClick={() => setOpen(false)}>
              Apply to become a maker
            </MenuLink>
          ) : null}
          {user.roles.includes('admin') ? (
            <Link
              to="/admin"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center justify-between border-t border-line bg-forest/[0.05] px-4 py-2 text-[12px] font-semibold text-forest hover:bg-forest/10"
            >
              <span>Administration</span>
              <span className="rounded bg-forest/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-forest">
                Admin
              </span>
            </Link>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOut();
            }}
            className="flex min-h-11 w-full items-center border-t border-line px-4 py-2.5 text-left text-[12.5px] text-muted hover:bg-paper hover:text-ink"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({ to, children, onClick }: { to: string; children: ReactNode; onClick: () => void }) {
  return (
    <Link
      to={to}
      role="menuitem"
      onClick={onClick}
      className="flex min-h-11 items-center px-4 py-2 text-[12.5px] text-ink hover:bg-paper hover:text-forest"
    >
      {children}
    </Link>
  );
}

function HeritageAnnouncementBar({ customText, light = false }: { customText?: string; light?: boolean }) {
  const { config } = useAuth();
  const freeShippingThreshold = config?.shipping.freeThresholdPaise ?? 0;

  return (
    <div
      className={`border-b transition-colors duration-300 ${
        light ? 'bg-black/50 text-white/90 border-white/10' : 'border-[#0F1614] bg-forest-deep text-paper'
      }`}
      aria-label="Dear Hills announcements"
    >
      <div className="mx-auto flex min-h-8 sm:min-h-9 lg:min-h-10 max-w-7xl lg:max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 py-1.5 sm:py-2 text-[11px] sm:text-xs lg:text-[13px] font-medium tracking-[0.02em]">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to="/offers/pahadi-festive-glow"
            className="flex items-center gap-1.5 font-bold text-butter hover:text-white transition-colors shrink-0"
          >
            <span>🪔</span>
            <span className="underline underline-offset-4 decoration-butter/60">Diwali Shubh Aarambh</span>
          </Link>
          <span className="opacity-40 hidden sm:inline" aria-hidden>·</span>
          <p className="line-clamp-1 truncate">
            {customText || 'Up to 30% Off Pure Himalayan Harvest & Handlooms · 0% Maker Commission'}
          </p>
        </div>
        {freeShippingThreshold > 0 ? (
          <p className="hidden shrink-0 text-sand xl:block">Free shipping over {formatINR(freeShippingThreshold)}</p>
        ) : null}
        <Link
          to="/offers/pahadi-festive-glow"
          className="hidden shrink-0 items-center gap-1.5 text-sand transition-colors hover:text-white md:flex font-semibold"
        >
          <span>Explore Diwali Offers</span> <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}

function Icon({ name, className = 'h-5 w-5' }: { name: 'search' | 'bag' | 'user' | 'home' | 'grid' | 'menu'; className?: string }) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m16.5 16.5 4 4" />
        </svg>
      );
    case 'bag':
      return (
        <svg {...common}>
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
          <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
        </svg>
      );
    case 'user':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      );
    case 'home':
      return (
        <svg {...common}>
          <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      );
    case 'menu':
      return (
        <svg {...common}>
          <path d="M4 7h16M4 12h16M4 17h10" />
        </svg>
      );
  }
}

function CartLink({ count, compact = false, light = false }: { count: number; compact?: boolean; light?: boolean }) {
  return (
    <Link
      to="/cart"
      className={
        compact
          ? `relative inline-flex h-11 w-11 lg:h-12 lg:w-12 items-center justify-center transition-colors ${
              light ? 'text-white hover:text-sand' : 'text-ink hover:text-terra'
            }`
          : `relative inline-flex min-h-11 lg:min-h-12 items-center gap-2 border px-3 sm:px-3.5 lg:px-4 text-[12px] sm:text-xs lg:text-sm font-medium transition-colors ${
              light
                ? 'border-white/30 bg-white/15 text-white hover:border-white/50'
                : 'border-line bg-surface text-ink hover:border-forest/40'
            }`
      }
      aria-label={`Shopping bag with ${count} item${count === 1 ? '' : 's'}`}
    >
      <Icon name="bag" className={compact ? 'h-5 w-5 lg:h-6 lg:w-6' : 'h-4 w-4 lg:h-5 lg:w-5'} />
      {!compact ? <span className="hidden sm:inline">Bag</span> : null}
      <span
        className={
          compact
            ? 'absolute right-1 top-1 lg:right-1.5 lg:top-1.5 flex h-4 min-w-4 lg:h-4.5 lg:min-w-4.5 items-center justify-center rounded-full bg-terra px-1 text-[9px] lg:text-[10px] font-bold text-white'
            : 'flex h-4 min-w-4 lg:h-4.5 lg:min-w-4.5 items-center justify-center rounded-full bg-terra px-1 text-[9px] lg:text-[10px] font-bold text-white'
        }
      >
        {count}
      </span>
    </Link>
  );
}

function Header() {
  const { user, signOut, config } = useAuth();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const isCheckout = location.pathname.startsWith('/checkout');
  const [scrolled, setScrolled] = useState(false);
  const cartCount = useCartCount();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const content = useSiteContent();
  const announcement = content.data?.content.announcement;
  const [menuPath, setMenuPath] = useState(location.pathname);

  const isTransparent = isHome && !scrolled;

  useEffect(() => {
    if (!isHome) {
      setScrolled(false);
      return;
    }
    const onScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    const frame = window.requestAnimationFrame(onScroll);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [isHome]);

  // Close any open menu as soon as the route changes, without an effect round-trip.
  if (menuPath !== location.pathname) {
    setMenuPath(location.pathname);
    setMobileOpen(false);
    setMoreOpen(false);
  }

  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = mobilePanelRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      panel?.querySelector<HTMLElement>('[data-menu-close]')?.focus();
    }, 0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
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
      previouslyFocused?.focus();
    };
  }, [mobileOpen]);

  if (isCheckout) {
    return (
      <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur-md">
        {config?.devMode ? (
          <div className="bg-[#b9694c] px-3 py-1 text-center text-[10px] font-medium tracking-[0.05em] text-white">
            Development build · demonstration data
            {config.payments.devPaymentsEnabled ? ' · simulated payments enabled' : ''}
          </div>
        ) : null}
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-3 px-4 sm:h-16 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Wordmark />
            <span className="hidden border-l border-line pl-3 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-muted sm:inline">
              Secure checkout
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <span className="hidden items-center gap-1.5 text-[10.5px] text-muted md:inline-flex">
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-forest" fill="none" aria-hidden>
                <rect x="4" y="8.5" width="12" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
                <path d="M7 8.5V6.4a3 3 0 0 1 6 0v2.1" stroke="currentColor" strokeWidth="1.4" />
              </svg>
              Encrypted
            </span>
            <AccountMenu />
            <CartLink count={cartCount} />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header
      className={`${
        isHome ? 'fixed top-0 left-0 right-0 z-40' : 'sticky top-0 z-40'
      } transition-all duration-300 ${
        isTransparent
          ? 'bg-black/40 backdrop-blur-md border-b border-white/10 text-white'
          : 'border-b border-line bg-paper/95 backdrop-blur-md text-ink shadow-2xs'
      }`}
    >
      {config?.devMode ? (
        <div className="bg-[#b9694c] px-3 py-1 text-center text-[10px] font-medium tracking-[0.05em] text-white">
          Development build · demonstration data
          {config.payments.devPaymentsEnabled ? ' · simulated payments enabled' : ''}
        </div>
      ) : null}
      <HeritageAnnouncementBar
        light={isTransparent}
        customText={announcement?.active && announcement.text ? announcement.text : undefined}
      />

      <div className="mx-auto flex h-14 sm:h-16 lg:h-20 max-w-7xl lg:max-w-[1440px] items-center gap-2 sm:gap-4 lg:gap-6 px-3 sm:px-6 lg:px-8">
        <div className="shrink-0">
          <Wordmark light={isTransparent} />
        </div>

        <div className="mx-2 hidden flex-1 md:flex lg:mx-4 max-w-xl xl:max-w-2xl">
          <EcommerceSearchBar light={isTransparent} inputId="site-search-desktop" />
        </div>

        <nav className="hidden items-center gap-6 lg:flex xl:gap-8" aria-label="Primary">
          {NAV.map((item) => {
            const active = item.to === '/shop' ? location.pathname.startsWith('/shop') : location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`border-b-2 py-1.5 text-[13px] lg:text-[14.5px] xl:text-[15px] font-medium transition-colors ${
                  active
                    ? isTransparent
                      ? 'border-butter text-butter font-semibold'
                      : 'border-terra text-forest font-semibold'
                    : isTransparent
                      ? 'border-transparent text-white/90 hover:border-white/40 hover:text-white'
                      : 'border-transparent text-ink/80 hover:border-line hover:text-forest'
                }`}
              >
                {item.label}
              </Link>
            );
          })}

          <Link
            to="/offers/pahadi-festive-glow"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs lg:text-[13px] font-bold tracking-wide transition-all ${
              isTransparent
                ? 'border border-butter/40 bg-butter/20 text-butter hover:bg-butter/30 shadow-xs'
                : 'border border-terra/40 bg-terra/15 text-terra hover:bg-terra/25 shadow-xs'
            }`}
          >
            <span>🪔</span>
            <span>Diwali Offers</span>
          </Link>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 lg:gap-3">
          <Link
            to="/account/wishlist"
            className={`hidden h-11 w-11 lg:h-12 lg:w-12 items-center justify-center transition-colors sm:inline-flex ${
              isTransparent ? 'text-white/90 hover:text-white' : 'text-ink hover:text-terra'
            }`}
            aria-label="Saved items"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5 lg:h-[22px] lg:w-[22px]" aria-hidden>
              <path
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                strokeWidth="1.6"
              />
            </svg>
          </Link>

          {user?.roles.includes('admin') ? (
            <Link
              to="/admin"
              className={`hidden items-center gap-1.5 rounded border px-2.5 sm:px-3 py-1 lg:py-1.5 text-[10px] sm:text-[11px] lg:text-xs font-semibold uppercase tracking-wider transition-colors xl:inline-flex ${
                isTransparent
                  ? 'border-white/30 bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm'
                  : 'border-forest/25 bg-surface text-forest hover:bg-forest/5'
              }`}
            >
              Admin
            </Link>
          ) : user?.roles.includes('seller') ? (
            <Link
              to="/seller"
              className="hidden items-center gap-1.5 rounded border border-terra/30 bg-terra/20 px-2.5 sm:px-3 py-1 lg:py-1.5 text-[10px] sm:text-[11px] lg:text-xs font-semibold uppercase tracking-wider text-terra transition-colors hover:bg-terra/30 xl:inline-flex backdrop-blur-sm"
            >
              Seller Studio
            </Link>
          ) : null}

          <div className="hidden sm:block">
            <AccountMenu light={isTransparent} />
          </div>

          <CartLink count={cartCount} compact light={isTransparent} />

          <button
            ref={menuButtonRef}
            type="button"
            className={`inline-flex h-11 w-11 items-center justify-center transition-colors lg:hidden ${
              isTransparent ? 'text-white hover:text-sand' : 'text-ink hover:text-terra'
            }`}
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="px-3 pb-2.5 md:hidden">
        <EcommerceSearchBar light={isTransparent} inputId="site-search-mobile" />
      </div>

      <div
        className={`hidden border-t md:block transition-colors duration-300 ${
          isTransparent
            ? 'border-white/10 bg-black/40 backdrop-blur-md text-white'
            : 'border-line bg-[#EFE9DD]/90 text-ink'
        }`}
      >
        <div className="mx-auto flex max-w-7xl lg:max-w-[1440px] items-center px-4 sm:px-6 lg:px-8 py-2 sm:py-2.5 text-[12px] sm:text-[13px] lg:text-[13.5px] font-medium">
          <div className="no-scrollbar flex w-full items-center gap-1 lg:gap-1.5 overflow-x-auto whitespace-nowrap">
            <Link
              to="/shop"
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 sm:px-3 py-1.5 sm:py-2 font-semibold transition-colors ${
                isTransparent ? 'text-white hover:bg-white/15' : 'text-forest hover:bg-forest/10'
              }`}
            >
              <Icon name="grid" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              All products
            </Link>
            <span className={isTransparent ? 'text-white/30 mx-1' : 'text-forest/25 mx-1'} aria-hidden>
              |
            </span>
            {[
              { label: 'Shawls & handlooms', slug: 'shawls-and-weaves' },
              { label: 'Kangra tea', slug: 'tea-and-infusions' },
              { label: 'Dry fruit & nuts', slug: 'dry-fruit-and-nuts' },
              { label: 'Honey & preserves', slug: 'pantry-and-preserves' },
              { label: 'Cold-pressed oils', slug: 'cold-pressed-oils' },
              { label: 'Knitwear', slug: 'knitwear' },
              { label: 'Himachali caps', slug: 'caps-and-headwear' },
            ].map((item) => (
              <Link
                key={item.slug}
                to={`/shop?category=${item.slug}`}
                className={`shrink-0 rounded-md px-2.5 sm:px-3 py-1.5 sm:py-2 transition-colors ${
                  isTransparent ? 'text-white/85 hover:bg-white/15 hover:text-white' : 'text-ink/80 hover:bg-forest/10 hover:text-forest'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/shop?category=gifting"
              className={`shrink-0 rounded-md px-2.5 sm:px-3 py-1.5 sm:py-2 font-semibold transition-colors ${
                isTransparent ? 'text-butter hover:bg-white/15' : 'text-terra hover:bg-forest/10'
              }`}
            >
              Curated gifting
            </Link>

            <Link
              to="/offers/pahadi-festive-glow"
              className={`shrink-0 rounded-md px-2.5 sm:px-3 py-1.5 sm:py-2 font-bold transition-colors flex items-center gap-1.5 ${
                isTransparent
                  ? 'text-butter hover:bg-white/15'
                  : 'text-[#C06041] hover:bg-terra/10'
              }`}
            >
              <span>🪔</span>
              <span>Diwali Offers</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                isTransparent ? 'bg-butter/25 text-butter border border-butter/40' : 'bg-terra/20 text-terra border border-terra/30'
              }`}>
                30% off
              </span>
            </Link>

            <div className="relative inline-block shrink-0" ref={moreRef}>
              <button
                type="button"
                onClick={() => setMoreOpen((value) => !value)}
                className={`flex items-center gap-1 rounded-md px-2.5 sm:px-3 py-1.5 sm:py-2 font-medium transition-colors ${
                  isTransparent ? 'text-white/85 hover:bg-white/15 hover:text-white' : 'text-ink/85 hover:bg-forest/10 hover:text-forest'
                }`}
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                aria-label="More categories and stories"
              >
                More
                <svg viewBox="0 0 20 20" fill="currentColor" className={`h-3.5 w-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} aria-hidden>
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>
              {moreOpen ? (
                <div role="menu" className="absolute left-0 top-full z-50 mt-1.5 w-60 border border-line bg-surface py-1.5 text-ink shadow-xl">
                  {[
                    { label: 'Mountain pulses & staples', to: '/shop?category=pulses-and-staples' },
                    { label: 'Meet the makers', to: '/makers' },
                    { label: 'The sourcing standard', to: '/sourcing' },
                    { label: 'Our story & heritage', to: '/about' },
                    { label: 'Authenticity & proof', to: '/policies/authenticity' },
                  ].map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      role="menuitem"
                      onClick={() => setMoreOpen(false)}
                      className="flex min-h-11 items-center px-4 py-2 text-[12px] text-ink transition-colors hover:bg-paper hover:text-forest"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {mobileOpen ? (
        <div
          ref={mobilePanelRef}
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-50 flex flex-col bg-paper lg:hidden"
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
            <Wordmark />
            <button
              type="button"
              data-menu-close
              onClick={() => setMobileOpen(false)}
              className="inline-flex h-11 w-11 items-center justify-center text-ink transition-colors hover:text-terra"
              aria-label="Close menu"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
                <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-10 pt-4">
            <nav aria-label="Mobile primary">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className="flex min-h-12 items-center justify-between border-b border-line/70 py-3 font-serif text-2xl text-forest transition-colors hover:text-terra"
                >
                  <span>{item.label}</span>
                  <span aria-hidden className="text-base text-muted">
                    →
                  </span>
                </Link>
              ))}
              <Link
                to="/shop"
                onClick={() => setMobileOpen(false)}
                className="flex min-h-12 items-center justify-between border-b border-line/70 py-3 font-serif text-2xl text-forest transition-colors hover:text-terra"
              >
                <span>All products</span>
                <span aria-hidden className="text-base text-muted">
                  →
                </span>
              </Link>
            </nav>

            <div className="mt-6 space-y-1">
              <Link to="/account" onClick={() => setMobileOpen(false)} className="flex min-h-11 items-center justify-between py-2 text-sm font-medium text-ink">
                <span>{user ? 'Your account' : 'Sign in or create an account'}</span>
                <span aria-hidden className="text-muted">→</span>
              </Link>
              <Link to="/account/orders" onClick={() => setMobileOpen(false)} className="flex min-h-11 items-center justify-between py-2 text-sm text-ink/85">
                <span>Orders &amp; returns</span>
                <span aria-hidden className="text-muted">→</span>
              </Link>
              <Link to="/account/wishlist" onClick={() => setMobileOpen(false)} className="flex min-h-11 items-center justify-between py-2 text-sm text-ink/85">
                <span>Saved items</span>
                <span aria-hidden className="text-muted">→</span>
              </Link>
              <Link to="/contact" onClick={() => setMobileOpen(false)} className="flex min-h-11 items-center justify-between py-2 text-sm text-ink/85">
                <span>Help &amp; contact</span>
                <span aria-hidden className="text-muted">→</span>
              </Link>
            </div>

            <div className="mt-6 space-y-2 border-t border-line pt-5">
              {user?.roles.includes('admin') ? (
                <Link to="/admin" onClick={() => setMobileOpen(false)} className="flex min-h-11 items-center justify-between border border-forest/20 bg-forest/5 px-3 py-2 text-sm font-semibold text-forest">
                  <span>Administration</span>
                  <span aria-hidden>→</span>
                </Link>
              ) : null}
              {user?.roles.includes('seller') && !user?.roles.includes('admin') ? (
                <Link to="/seller" onClick={() => setMobileOpen(false)} className="flex min-h-11 items-center justify-between border border-terra/30 bg-terra/10 px-3 py-2 text-sm font-semibold text-terra">
                  <span>Seller Studio</span>
                  <span aria-hidden>→</span>
                </Link>
              ) : null}
              {!user?.roles.includes('seller') && !user?.roles.includes('admin') ? (
                <Link to="/sell" onClick={() => setMobileOpen(false)} className="flex min-h-11 items-center justify-between px-1 py-2 text-sm font-medium text-terra">
                  <span>Sell on Dear Hills</span>
                  <span aria-hidden>→</span>
                </Link>
              ) : null}
              {user ? (
                <button
                  type="button"
                  onClick={async () => {
                    setMobileOpen(false);
                    await signOut();
                  }}
                  className="flex min-h-11 w-full items-center px-1 py-2 text-left text-sm text-muted hover:text-ink"
                >
                  Sign out
                </button>
              ) : null}
            </div>

            <p className="mt-8 border-t border-line pt-5 text-[11px] leading-relaxed text-muted">
              Dear Hills · A curated marketplace for products made and grown in Himachal Pradesh.
            </p>
          </div>
        </div>
      ) : null}
    </header>
  );
}

const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];

function shouldShowTabBar(pathname: string): boolean {
  if (pathname === '/cart') return false;
  if (pathname.startsWith('/shop/')) return false;
  if (pathname.startsWith('/checkout') || pathname.startsWith('/seller') || pathname.startsWith('/admin')) return false;
  if (pathname === '/sell' || pathname.startsWith('/become-a-maker')) return false;
  if (AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return false;
  return ['/', '/shop', '/makers', '/about', '/sourcing', '/faq', '/contact', '/credits', '/offers', '/policies', '/account'].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function MobileTabBar() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const cartCount = useCartCount();
  if (!shouldShowTabBar(pathname)) return null;

  const tabs = [
    { label: 'Home', to: '/', icon: 'home' as const, active: pathname === '/' },
    { label: 'Shop', to: '/shop', icon: 'grid' as const, active: pathname === '/shop' },
    { label: 'Search', to: '/shop', icon: 'search' as const, active: false },
    { label: 'Account', to: user ? '/account' : '/login', icon: 'user' as const, active: pathname.startsWith('/account') },
    { label: 'Bag', to: '/cart', icon: 'bag' as const, active: pathname === '/cart', count: cartCount },
  ];

  return (
    <nav
      aria-label="Mobile shopping navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/98 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {tabs.map((tab) => {
          const content = (
            <>
              <span className="relative">
                <Icon name={tab.icon} className="h-5 w-5" />
                {'count' in tab && tab.count ? (
                  <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-terra px-1 text-[9px] font-bold text-white">
                    {tab.count}
                  </span>
                ) : null}
              </span>
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </>
          );
          const classes = `flex h-14 flex-col items-center justify-center gap-1 transition-colors ${
            tab.active ? 'text-terra' : 'text-ink/70 hover:text-forest'
          }`;
          return (
            <li key={tab.label}>
              {tab.label === 'Search' ? (
                <button
                  type="button"
                  className={`w-full ${classes}`}
                  onClick={() => {
                    // Two search inputs exist (compact mobile header, desktop bar);
                    // focus whichever one is actually rendered at this breakpoint.
                    const inputs = Array.from(
                      document.querySelectorAll<HTMLInputElement>('input[id^="site-search"]'),
                    );
                    const input = inputs.find((candidate) => candidate.offsetParent !== null);
                    if (input) {
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                      input.focus({ preventScroll: true });
                      input.select();
                    }
                  }}
                  aria-label="Search products"
                >
                  {content}
                </button>
              ) : (
                <Link to={tab.to} className={classes} aria-current={tab.active ? 'page' : undefined} aria-label={tab.label}>
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Newsletter() {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle');
  const toast = useToast();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!consent) {
      toast.push('Please confirm you want occasional emails.', 'error');
      return;
    }
    setStatus('saving');
    try {
      const result = await api<{ message: string }>('/newsletter', {
        method: 'POST',
        body: { email, consent: true, source: 'footer' },
      });
      setStatus('done');
      toast.push(result.message ?? 'You are on the list.');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
      setStatus('idle');
    }
  };

  return (
    <div>
      <h3 className="font-serif text-xl text-paper">Letters from the hills</h3>
      <p className="mt-2 text-sm leading-relaxed text-paper/70">
        Occasional dispatches on new makers, seasonal harvests and life across the Himalayan valleys. No daily promotions.
      </p>
      {status === 'done' ? (
        <p className="mt-4 border border-paper/20 bg-white/5 px-3 py-2.5 text-sm text-paper/90">
          You are on the list. You can unsubscribe anytime with one click.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Your email address"
              aria-label="Email address for newsletter"
              className="h-10 w-full border border-paper/30 bg-white/5 px-3.5 text-sm text-paper placeholder:text-paper/40 focus:border-sand focus:outline-none focus:ring-1 focus:ring-sand transition-all"
            />
            <button
              type="submit"
              disabled={status === 'saving'}
              className="h-10 shrink-0 border border-sand bg-sand/15 px-4 text-[12px] font-semibold uppercase tracking-wider text-paper hover:bg-sand/30 transition-colors disabled:opacity-50"
            >
              {status === 'saving' ? 'Joining…' : 'Join'}
            </button>
          </div>
          <label className="flex items-start gap-2 text-[11px] leading-relaxed text-paper/60 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5 accent-terra"
            />
            I agree to receive occasional dispatches from DEAR HILLS.
          </label>
        </form>
      )}
    </div>
  );
}

function Footer() {
  const { config } = useAuth();
  return (
    <footer className="mt-20 border-t border-forest-deep bg-forest text-paper">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 border-b border-paper/15 pb-14 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <Wordmark compact light />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-paper/70">
              A curated marketplace for products made and grown in Himachal Pradesh. Every listing names the store behind
              it, and every maker and product is reviewed before publication.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-[10.5px] uppercase tracking-[0.16em] text-paper/50">
              <span>Mandi</span> · <span>Kullu</span> · <span>Kangra</span> · <span>Kinnaur</span> · <span>Lahaul</span> · <span>Chamba</span>
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sand/80">Explore the shelves</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-paper/75">
              <li><Link to="/shop" className="hover:text-sand transition-colors">All products</Link></li>
              <li><Link to="/shop?category=shawls-and-weaves" className="hover:text-sand transition-colors">Shawls & Handlooms</Link></li>
              <li><Link to="/shop?category=pantry-and-preserves" className="hover:text-sand transition-colors">Mountain Pantry & Honey</Link></li>
              <li><Link to="/shop?category=gifting" className="hover:text-sand transition-colors">Curated Himalayan Gifting</Link></li>
              <li><Link to="/makers" className="hover:text-sand transition-colors">Meet the makers</Link></li>
              <li><Link to="/sourcing" className="hover:text-sand transition-colors">The Sourcing Standard</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sand/80">Information & Trust</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-paper/75">
              <li><Link to="/about" className="hover:text-sand transition-colors">Our story & philosophy</Link></li>
              <li><Link to="/policies/shipping" className="hover:text-sand transition-colors">Shipping & delivery</Link></li>
              <li><Link to="/policies/returns" className="hover:text-sand transition-colors">Returns & refunds</Link></li>
              <li><Link to="/policies/authenticity" className="hover:text-sand transition-colors">Authenticity & product claims</Link></li>
              <li><Link to="/policies/seller-terms" className="hover:text-sand transition-colors">Seller terms & KYC</Link></li>
              <li><Link to="/credits" className="hover:text-sand transition-colors">Photography credits</Link></li>
              <li><Link to="/contact" className="hover:text-sand transition-colors">Contact & support</Link></li>
            </ul>
          </div>

          <Newsletter />
        </div>

        <div className="flex flex-col gap-4 pt-8 text-[11px] leading-relaxed text-paper/50 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-1.5">
            <p>
              © {new Date().getFullYear()} DEAR HILLS. Demonstration build — policy documents are drafts pending legal
              review. Product and seller records in this environment are labelled demo data.
            </p>
            <p>
              Photography is authentic and illustrative of Himachal Pradesh, sourced under creative licences listed on the{' '}
              <Link to="/credits" className="underline underline-offset-2 hover:text-paper">credits page</Link>.
            </p>
            {config?.supportEmailIsPlaceholder ? (
              <p className="text-terra/90">Support email is configured for development. Replace with live contact before public launch.</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-4 text-paper/60">
            <Link to="/faq" className="hover:text-paper transition-colors">FAQ</Link>
            <Link to="/policies/privacy" className="hover:text-paper transition-colors">Privacy Policy</Link>
            <Link to="/policies/terms" className="hover:text-paper transition-colors">Terms of Service</Link>
            <Link to="/sell" className="hover:text-paper transition-colors">Seller Registration</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function CheckoutFooter() {
  return (
    <footer className="border-t border-[#E3D9C9] bg-[#F6F0E6]">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-6 text-[10.5px] leading-relaxed text-[#7A8179] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>© {new Date().getFullYear()} DEAR HILLS. Handmade and grown in Himachal Pradesh.</p>
        <nav aria-label="Checkout help" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link to="/policies/shipping" className="transition-colors hover:text-[#234638]">
            Shipping
          </Link>
          <Link to="/policies/returns" className="transition-colors hover:text-[#234638]">
            Returns
          </Link>
          <Link to="/policies/privacy" className="transition-colors hover:text-[#234638]">
            Privacy
          </Link>
          <Link to="/contact" className="transition-colors hover:text-[#234638]">
            Help
          </Link>
        </nav>
      </div>
    </footer>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

export function PublicLayout() {
  const { pathname } = useLocation();
  const isCheckout = pathname.startsWith('/checkout');
  const showTabBar = shouldShowTabBar(pathname);
  return (
    <div className="flex min-h-screen flex-col">
      <ScrollToTop />
      <Header />
      <main className={`flex-1 ${showTabBar ? 'pb-safe-tabbar' : ''}`}>
        <Outlet />
      </main>
      {isCheckout ? <CheckoutFooter /> : <Footer />}
      <MobileTabBar />
    </div>
  );
}

export { Wordmark };
