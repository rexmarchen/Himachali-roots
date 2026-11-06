import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { api, errorMessage } from '@/lib/api';
import { useAuth, useCartCount, useSiteContent } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { EcommerceSearchBar } from './EcommerceSearchBar';

const NAV = [
  { label: 'Shop', to: '/shop' },
  { label: 'Makers', to: '/makers' },
  { label: 'How we source', to: '/sourcing' },
  { label: 'Our Story', to: '/about' },
];

const CATEGORY_NAV = [
  { label: 'Shawls & handlooms', slug: 'shawls-and-weaves' },
  { label: 'Kangra orthodox tea', slug: 'tea-and-infusions' },
  { label: 'Dry fruit & nuts', slug: 'dry-fruit-and-nuts' },
  { label: 'Honey & preserves', slug: 'pantry-and-preserves' },
  { label: 'Cold-pressed oils', slug: 'cold-pressed-oils' },
  { label: 'Mountain pulses', slug: 'pulses-and-staples' },
  { label: 'Warm knitwear', slug: 'knitwear' },
  { label: 'Himachali caps', slug: 'caps-and-headwear' },
  { label: 'Curated gifting', slug: 'gifting' },
  { label: 'All products', slug: '' },
];

function Diya({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M12 3.2c1.6 1.5 2.4 2.7 2.4 3.9a2.4 2.4 0 0 1-4.8 0c0-1.2.8-2.4 2.4-3.9Z" />
      <path d="M3.6 12.4h16.8c-.9 2.9-4.2 4.6-8.4 4.6s-7.5-1.7-8.4-4.6Z" strokeLinejoin="round" />
      <path d="M9.6 20.4h4.8" strokeLinecap="round" />
    </svg>
  );
}

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
        className={`inline-flex min-h-11 items-center whitespace-nowrap px-2.5 text-[12.5px] font-medium transition-colors sm:px-3 sm:text-xs lg:min-h-12 lg:text-[14px] ${
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
  return (
    <div
      className={`border-b transition-colors duration-300 ${
        light ? 'border-white/10 bg-black/50 text-white/90' : 'border-[#0F1614] bg-forest-deep text-paper'
      }`}
      aria-label="Dear Hills announcements"
    >
      <div className="shell flex h-9 items-center justify-center gap-2.5 overflow-hidden text-[10px] font-medium uppercase tracking-[0.16em] sm:h-10 sm:text-[10.5px]">
        <Diya className="h-3.5 w-3.5 shrink-0 text-butter" />
        <Link to="/offers/pahadi-festive-glow" className="min-w-0 truncate transition-colors hover:text-butter">
          {customText || 'Festive harvest · up to 30% off · 0% platform fee'}
        </Link>
        <Link
          to="/offers/pahadi-festive-glow"
          className="hidden shrink-0 items-center gap-1.5 font-semibold text-butter underline decoration-butter/50 underline-offset-4 transition-colors hover:text-white md:inline-flex"
        >
          Diwali offers
          <span aria-hidden>→</span>
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
          ? `relative inline-flex h-9.5 w-9.5 lg:h-10 lg:w-10 items-center justify-center transition-colors ${
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
      <Icon name="bag" className={compact ? 'h-4.5 w-4.5 lg:h-5 lg:w-5' : 'h-4 w-4 lg:h-5 lg:w-5'} />
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
  const isCheckout = location.pathname.startsWith('/checkout');
  const cartCount = useCartCount();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const shopRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const content = useSiteContent();
  const announcement = content.data?.content.announcement;
  const [menuPath, setMenuPath] = useState(location.pathname);

  // Close any open menu as soon as the route changes, without an effect round-trip.
  if (menuPath !== location.pathname) {
    setMenuPath(location.pathname);
    setMobileOpen(false);
    setShopOpen(false);
    setSearchOpen(false);
  }

  useEffect(() => {
    if (!shopOpen) return;
    const onClick = (event: MouseEvent) => {
      if (shopRef.current && !shopRef.current.contains(event.target as Node)) setShopOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShopOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [shopOpen]);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = document.documentElement;
        const max = el.scrollHeight - el.clientHeight;
        setProgress(max > 0 ? Math.min(1, el.scrollTop / max) : 0);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

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
    <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/95 text-ink backdrop-blur-md">
      <HeritageAnnouncementBar
        customText={announcement?.active && announcement.text ? announcement.text : undefined}
      />

      <div className="shell flex h-16 items-center gap-3 lg:h-[76px] lg:gap-6">
        <div className="shrink-0">
          <Wordmark />
        </div>

        <nav className="hidden items-center gap-4 whitespace-nowrap lg:flex xl:gap-6" aria-label="Primary">
          {NAV.map((item) => {
            const active = item.to === '/shop' ? location.pathname.startsWith('/shop') : location.pathname === item.to;

            if (item.label === 'Shop') {
              return (
                <div key={item.to} className="relative" ref={shopRef}>
                  <button
                    type="button"
                    onClick={() => setShopOpen((value) => !value)}
                    className={`flex items-center gap-1.5 py-2 text-[13px] font-medium transition-colors ${
                      active || shopOpen ? 'text-terra' : 'text-ink/80 hover:text-forest'
                    }`}
                    aria-expanded={shopOpen}
                    aria-haspopup="true"
                  >
                    {item.label}
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={`h-3 w-3 transition-transform duration-200 ${shopOpen ? 'rotate-180' : ''}`} aria-hidden>
                      <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {shopOpen ? (
                    <div className="absolute left-1/2 top-full z-50 w-[30rem] -translate-x-1/2 pt-3">
                      <div className="border border-line bg-paper p-6 shadow-lift fade-in">
                        <p className="t-eyebrow mb-4 text-terra">Shop by shelf</p>
                        <div className="grid grid-cols-2 gap-x-7">
                          {CATEGORY_NAV.map((category) => (
                            <Link
                              key={category.slug || 'all'}
                              to={category.slug ? `/shop?category=${category.slug}` : '/shop'}
                              onClick={() => setShopOpen(false)}
                              className="group/link flex min-h-9 items-center justify-between gap-2 text-[13px] text-ink/85 transition-colors hover:text-terra"
                            >
                              <span>{category.label}</span>
                              <span
                                className="text-[11px] text-muted/50 transition-all duration-200 group-hover/link:translate-x-0.5 group-hover/link:text-terra"
                                aria-hidden
                              >
                                →
                              </span>
                            </Link>
                          ))}
                        </div>
                        <div className="mt-5 flex items-center justify-between">
                          <Link to="/shop" onClick={() => setShopOpen(false)} className="link-arrow">
                            Browse everything
                          </Link>
                          <Link
                            to="/offers/pahadi-festive-glow"
                            onClick={() => setShopOpen(false)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-terra/30 bg-terra/[0.08] px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-terra"
                          >
                            <Diya className="h-3 w-3" />
                            Diwali offers
                          </Link>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            }

            return (
              <Link
                key={item.to}
                to={item.to}
                className={`py-2 text-[13px] font-medium transition-colors ${
                  active ? 'text-terra' : 'text-ink/80 hover:text-forest'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            onClick={() => setSearchOpen((value) => !value)}
            className="inline-flex h-10 w-10 items-center justify-center text-ink transition-colors hover:text-terra md:hidden"
            aria-label={searchOpen ? 'Close search' : 'Open search'}
            aria-expanded={searchOpen}
          >
            <Icon name="search" className="h-5 w-5" />
          </button>

          <div className="hidden w-[190px] md:block lg:w-[200px] xl:w-[250px] 2xl:w-[290px]">
            <EcommerceSearchBar inputId="site-search-desktop" />
          </div>

          <Link
            to="/account/wishlist"
            className="hidden h-10 w-10 items-center justify-center text-ink transition-colors hover:text-terra xl:inline-flex"
            aria-label="Saved items"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-[18px] w-[18px]" aria-hidden>
              <path
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                strokeWidth="1.6"
              />
            </svg>
          </Link>

          {user?.roles.includes('admin') ? (
            <Link
              to="/admin"
              className="hidden items-center rounded-full border border-forest/25 bg-surface px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-forest transition-colors hover:bg-forest/5 xl:inline-flex"
            >
              Admin
            </Link>
          ) : user?.roles.includes('seller') ? (
            <Link
              to="/seller"
              className="hidden items-center rounded-full border border-terra/30 bg-terra/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-terra transition-colors hover:bg-terra/20 xl:inline-flex"
            >
              Studio
            </Link>
          ) : null}

          <div className="hidden sm:block">
            <AccountMenu />
          </div>

          <CartLink count={cartCount} compact />

          <button
            ref={menuButtonRef}
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center text-ink transition-colors hover:text-terra lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>
        </div>
      </div>

      {searchOpen ? (
        <div className="shell pb-4 md:hidden">
          <EcommerceSearchBar inputId="site-search-mobile" />
        </div>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 h-px bg-line/70" aria-hidden>
        <div
          className="h-full origin-left bg-terra transition-transform duration-150 ease-out"
          style={{ transform: `scaleX(${progress})` }}
        />
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

            <div className="mt-6 border-t border-line pt-5">
              <p className="t-eyebrow mb-2 text-terra">Shop by shelf</p>
              <div className="grid grid-cols-2 gap-x-5">
                {CATEGORY_NAV.filter((category) => category.slug).map((category) => (
                  <Link
                    key={category.slug}
                    to={`/shop?category=${category.slug}`}
                    onClick={() => setMobileOpen(false)}
                    className="flex min-h-10 items-center border-b border-line/50 text-[12.5px] text-ink/80 transition-colors hover:text-terra"
                  >
                    {category.label}
                  </Link>
                ))}
              </div>
            </div>

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
      <h3 className="font-serif text-[1.35rem] text-paper">Letters from the hills</h3>
      <p className="mt-2.5 text-[13px] leading-relaxed text-paper/65">
        Occasional dispatches on new makers, seasonal harvests and life across the Himalayan valleys. No daily promotions.
      </p>
      {status === 'done' ? (
        <p className="mt-5 rounded-full border border-paper/20 bg-white/5 px-4 py-2.5 text-[13px] text-paper/90">
          You are on the list. You can unsubscribe anytime with one click.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-3">
          <div className="flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Your email address"
              aria-label="Email address for newsletter"
              className="h-11 w-full rounded-full border border-paper/25 bg-white/5 px-4 text-[13px] text-paper placeholder:text-paper/40 focus:border-sand focus:outline-none focus:ring-1 focus:ring-sand transition-all"
            />
            <button
              type="submit"
              disabled={status === 'saving'}
              className="h-11 shrink-0 rounded-full border border-sand bg-sand px-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-forest-deep transition-colors hover:bg-paper disabled:opacity-50"
            >
              {status === 'saving' ? 'Joining…' : 'Join'}
            </button>
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-paper/55">
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
    <footer className="border-t border-paper/10 bg-forest text-paper">
      <div className="shell py-16 lg:py-20">
        <div className="grid gap-12 border-b border-paper/15 pb-14 md:grid-cols-2 lg:grid-cols-[1.15fr_0.85fr_0.85fr_1.15fr] lg:gap-10">
          <div>
            <Wordmark compact light />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-paper/70">
              A curated marketplace for products made and grown in Himachal Pradesh. Every listing names the store behind
              it, and every maker and product is reviewed before publication.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-[10px] uppercase tracking-[0.18em] text-paper/45">
              <span>Mandi</span>
              <span>Kullu</span>
              <span>Kangra</span>
              <span>Kinnaur</span>
              <span>Lahaul</span>
              <span>Chamba</span>
            </div>
          </div>

          <div>
            <h3 className="text-[9.5px] font-semibold uppercase tracking-[0.24em] text-sand/70">Explore the shelves</h3>
            <ul className="mt-5 space-y-3 text-[13px] text-paper/75">
              <li><Link to="/shop" className="transition-colors hover:text-sand">All products</Link></li>
              <li><Link to="/shop?category=shawls-and-weaves" className="transition-colors hover:text-sand">Shawls &amp; handlooms</Link></li>
              <li><Link to="/shop?category=pantry-and-preserves" className="transition-colors hover:text-sand">Pantry &amp; honey</Link></li>
              <li><Link to="/shop?category=gifting" className="transition-colors hover:text-sand">Curated gifting</Link></li>
              <li><Link to="/makers" className="transition-colors hover:text-sand">Meet the makers</Link></li>
              <li><Link to="/sourcing" className="transition-colors hover:text-sand">The sourcing standard</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-[9.5px] font-semibold uppercase tracking-[0.24em] text-sand/70">Care &amp; information</h3>
            <ul className="mt-5 space-y-3 text-[13px] text-paper/75">
              <li><Link to="/about" className="transition-colors hover:text-sand">Our story</Link></li>
              <li><Link to="/policies/shipping" className="transition-colors hover:text-sand">Shipping &amp; delivery</Link></li>
              <li><Link to="/policies/returns" className="transition-colors hover:text-sand">Returns &amp; refunds</Link></li>
              <li><Link to="/policies/authenticity" className="transition-colors hover:text-sand">Authenticity</Link></li>
              <li><Link to="/policies/seller-terms" className="transition-colors hover:text-sand">Seller terms &amp; KYC</Link></li>
              <li><Link to="/contact" className="transition-colors hover:text-sand">Contact &amp; support</Link></li>
            </ul>
          </div>

          <Newsletter />
        </div>

        <div className="flex flex-col gap-8 border-b border-paper/10 py-8 sm:flex-row sm:items-center sm:justify-between">
          <ul className="grid grid-cols-2 gap-x-8 gap-y-3 text-[10.5px] uppercase tracking-[0.14em] text-paper/55 sm:flex sm:flex-wrap sm:gap-x-10">
            <li>Reviewed makers</li>
            <li>Origin documented</li>
            <li>Ships across India</li>
            <li>Secure payments</li>
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            {['UPI', 'VISA', 'Mastercard', 'RuPay', 'Razorpay'].map((mark) => (
              <span
                key={mark}
                className="rounded-full border border-paper/20 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-paper/60"
              >
                {mark}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-5 pt-7 text-[11px] leading-relaxed text-paper/45 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <p>© {new Date().getFullYear()} DEAR HILLS · Handmade and grown in Himachal Pradesh.</p>
            <p>
              Photography is illustrative of Himachal Pradesh and licensed on the{' '}
              <Link to="/credits" className="underline underline-offset-2 hover:text-paper">credits page</Link>.
            </p>
            {config?.supportEmailIsPlaceholder ? (
              <p className="text-terra/80">Support email is configured for development. Replace with live contact before public launch.</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-5 text-paper/55">
            <Link to="/faq" className="transition-colors hover:text-paper">FAQ</Link>
            <Link to="/policies/privacy" className="transition-colors hover:text-paper">Privacy</Link>
            <Link to="/policies/terms" className="transition-colors hover:text-paper">Terms</Link>
            <Link to="/sell" className="transition-colors hover:text-paper">Sell with us</Link>
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

function HelpFloat() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/checkout') || pathname.startsWith('/admin') || pathname.startsWith('/seller')) return null;

  return (
    <Link
      to="/contact"
      aria-label="Questions? Talk to us"
      className="fixed bottom-24 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-forest text-paper shadow-lift transition-transform duration-200 hover:-translate-y-0.5 md:bottom-6 md:right-6"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden>
        <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5Z" strokeLinejoin="round" />
        <path d="M8.5 10.5h7M8.5 14h4.5" strokeLinecap="round" />
      </svg>
    </Link>
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
      <HelpFloat />
    </div>
  );
}

export { Wordmark };
