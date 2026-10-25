import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '@/lib/api';
import { useAuth, useCartCount, useSiteContent } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { Button, Input } from './ui';
import { EcommerceSearchBar } from './EcommerceSearchBar';

const NAV = [
  { label: 'Shop', to: '/shop' },
  { label: 'Makers', to: '/makers' },
  { label: 'How we source', to: '/sourcing' },
  { label: 'Our Story', to: '/about' },
];

function Wordmark({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <Link to="/" className="group flex items-center gap-3" aria-label="PAHADI ROOTS home">
      <svg viewBox="0 0 48 48" className="h-9 w-9 shrink-0 drop-shadow-xs" aria-hidden>
        <rect width="48" height="48" rx="2" fill={light ? '#F7F3EB' : '#243D32'} />
        <path d="M9 35 20 15l5 11 4-6 9 15H9Z" fill={light ? '#243D32' : '#F7F3EB'} />
        <path d="M16 35 25 21l6 14H16Z" fill="#C77759" />
        <circle cx="35" cy="14" r="3.4" fill={light ? '#879483' : '#DCD2C2'} />
      </svg>
      <span className="leading-none">
        <span
          className={`block font-serif text-[19px] tracking-[0.02em] transition-colors duration-200 ${
            light ? 'text-[#FFFEFA] group-hover:text-sand' : 'text-forest group-hover:text-terra'
          }`}
        >
          PAHADI ROOTS
        </span>
        {!compact ? (
          <span
            className={`mt-1 block text-[8.5px] font-semibold uppercase tracking-[0.32em] transition-colors duration-200 ${
              light ? 'text-white/70' : 'text-muted'
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

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!user) {
    return (
      <Link
        to="/login"
        className={`text-[12.5px] font-medium transition-colors duration-200 ${
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
        className={`flex items-center gap-1.5 text-[12.5px] font-medium transition-colors duration-200 ${
          light ? 'text-white hover:text-sand' : 'text-ink hover:text-terra'
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${
            light
              ? 'border border-white/40 bg-white/20 text-white'
              : 'border border-forest/20 bg-forest/[0.06] text-forest'
          }`}
        >
          {(user.fullName || user.email).slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-24 truncate sm:block">{user.fullName.split(' ')[0] || 'Account'}</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-9 z-50 w-56 border border-line bg-surface py-1 shadow-xl fade-up"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-[13px] font-medium text-ink">{user.fullName || 'Account'}</p>
            <p className="truncate text-[11px] text-muted">{user.email}</p>
          </div>
          <MenuLink to="/account" onClick={() => setOpen(false)}>
            Your account
          </MenuLink>
          <MenuLink to="/account/orders" onClick={() => setOpen(false)}>
            Orders & returns
          </MenuLink>
          <MenuLink to="/account/wishlist" onClick={() => setOpen(false)}>
            Saved items
          </MenuLink>
          {user.roles.includes('seller') ? (
            <MenuLink to="/seller" onClick={() => setOpen(false)}>
              Seller portal
            </MenuLink>
          ) : (
            <MenuLink to="/sell" onClick={() => setOpen(false)}>
              Apply to sell
            </MenuLink>
          )}
          {user.roles.includes('admin') ? (
            <Link
              to="/admin"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between border-t border-line bg-forest/[0.05] px-4 py-2.5 text-[12.5px] font-semibold text-forest hover:bg-forest/10"
            >
              <span>Administration</span>
              <span className="rounded bg-forest/20 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-forest">
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
            className="block w-full border-t border-line px-4 py-2.5 text-left text-[12.5px] text-muted hover:bg-paper hover:text-ink"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({ to, children, onClick }: { to: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link
      to={to}
      role="menuitem"
      onClick={onClick}
      className="block px-4 py-2 text-[12.5px] text-ink hover:bg-paper hover:text-forest"
    >
      {children}
    </Link>
  );
}

function Header() {
  const { user } = useAuth();
  const cartCount = useCartCount();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const content = useSiteContent();
  const announcement = content.data?.content.announcement;

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 45);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isTransparent = isHome && !scrolled;

  return (
    <header
      className={`${
        isHome ? 'fixed top-0 left-0 right-0 z-40' : 'sticky top-0 z-40'
      } transition-all duration-300 ${
        isTransparent
          ? 'bg-gradient-to-b from-black/60 via-black/25 to-transparent border-b border-transparent'
          : 'bg-[#F7F3EB]/95 backdrop-blur-md border-b border-[#E5DED2] shadow-xs'
      }`}
    >
      {announcement?.active ? (
        <div
          className={`transition-colors duration-300 ${
            isTransparent ? 'bg-black/40 text-paper/90 border-b border-white/10' : 'bg-forest text-paper'
          }`}
        >
          <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-1.5 text-center text-[10.5px] tracking-[0.04em] sm:text-[11px]">
            <span className="hidden h-1.5 w-1.5 rounded-full bg-terra sm:block" aria-hidden />
            {announcement.href ? (
              <Link to={announcement.href} className="hover:underline underline-offset-2">
                {announcement.text}
              </Link>
            ) : (
              <span>{announcement.text}</span>
            )}
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex h-[72px] sm:h-[78px] max-w-7xl items-center justify-between gap-3 sm:gap-6 px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <div className="shrink-0">
          <Wordmark light={isTransparent} />
        </div>

        {/* Central Production Ecommerce Search Bar (Amazon / Flipkart Style) */}
        <div className="hidden md:flex flex-1 max-w-xl lg:max-w-2xl mx-2 lg:mx-6">
          <EcommerceSearchBar light={isTransparent} />
        </div>

        {/* User Actions & Navigation */}
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <Link
            to="/makers"
            className={`hidden xl:inline-flex text-[13px] font-medium transition-colors ${
              isTransparent ? 'text-white/90 hover:text-white' : 'text-ink hover:text-terra'
            }`}
          >
            Makers
          </Link>

          <Link
            to="/account/wishlist"
            className={`hidden items-center gap-1.5 text-[12.5px] font-medium transition-colors sm:flex ${
              isTransparent ? 'text-white/90 hover:text-white' : 'text-ink hover:text-terra'
            }`}
            title="Saved items"
            aria-label="Saved items"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4" aria-hidden>
              <path
                d="M10 16.5l-6-6a4.2 4.2 0 0 1 0-6 4.2 4.2 0 0 1 6 0l0 0 0 0a4.2 4.2 0 0 1 6 0 4.2 4.2 0 0 1 0 6l-6 6Z"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
            <span className="hidden lg:inline">Saved</span>
          </Link>

          <span
            className={`hidden h-4 w-px transition-colors duration-200 sm:block ${
              isTransparent ? 'bg-white/20' : 'bg-line'
            }`}
            aria-hidden
          />

          {user?.roles.includes('admin') ? (
            <Link
              to="/admin"
              className={`hidden sm:inline-flex items-center gap-1 rounded border px-2.5 py-1 text-[11.5px] font-semibold tracking-wide uppercase transition-all shadow-xs ${
                isTransparent
                  ? 'border-white/40 bg-white/15 text-white hover:bg-white/25'
                  : 'border-forest/30 bg-forest/[0.08] text-forest hover:bg-forest/15'
              }`}
            >
              <span>Admin Panel</span>
            </Link>
          ) : null}

          <div className="hidden sm:block">
            <AccountMenu light={isTransparent} />
          </div>

          <Link
            to="/cart"
            className={`relative flex items-center gap-1.5 sm:gap-2 rounded-full px-3 sm:px-3.5 py-1.5 text-[12.5px] font-medium transition-all ${
              isTransparent
                ? 'bg-white/15 hover:bg-white/25 text-white border border-white/25 shadow-xs'
                : 'bg-sand/70 hover:bg-sand text-ink border border-line shadow-2xs'
            }`}
            aria-label={`Shopping bag with ${cartCount} items`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" aria-hidden>
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" strokeWidth="1.8" />
              <line x1="3" y1="6" x2="21" y2="6" strokeWidth="1.8" />
              <path d="M16 10a4 4 0 0 1-8 0" strokeWidth="1.8" />
            </svg>
            <span className="hidden sm:inline">Bag</span>
            <span
              className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                cartCount > 0
                  ? 'bg-terra text-white shadow-xs'
                  : isTransparent
                    ? 'bg-white/20 text-white'
                    : 'bg-sand text-ink'
              }`}
            >
              {cartCount}
            </span>
          </Link>

          <button
            type="button"
            className="flex flex-col justify-center gap-1.5 p-1.5 md:hidden"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
          >
            <span className={`h-0.5 w-5 transition-colors ${isTransparent ? 'bg-white' : 'bg-ink'}`} />
            <span className={`h-0.5 w-5 transition-colors ${isTransparent ? 'bg-white' : 'bg-ink'}`} />
            <span className={`h-0.5 w-3.5 transition-colors ${isTransparent ? 'bg-white' : 'bg-ink'}`} />
          </button>
        </div>
      </div>

      {/* Mobile Search Bar Row (like Flipkart / Amazon Mobile) */}
      <div className="md:hidden px-4 pb-3">
        <EcommerceSearchBar light={isTransparent} />
      </div>

      {/* Flipkart / Amazon Department Category Navigation Ribbon */}
      <div
        className={`border-t transition-colors duration-200 overflow-x-auto no-scrollbar ${
          isTransparent
            ? 'border-white/10 bg-black/30 backdrop-blur-md text-white/90'
            : 'border-[#E5DED2] bg-[#EFE9DD]/95 text-ink'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center gap-1 sm:gap-2 px-4 sm:px-6 lg:px-8 py-2 text-xs font-medium whitespace-nowrap">
          <Link
            to="/shop"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-white/20 transition-colors font-semibold"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" aria-hidden>
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
            </svg>
            <span>All Products</span>
          </Link>
          <span className="opacity-30">|</span>
          <Link to="/shop?category=shawls-and-weaves" className="px-2.5 py-1 rounded-md hover:bg-white/20 transition-colors">
            Shawls & Handlooms
          </Link>
          <Link to="/shop?category=tea-and-infusions" className="px-2.5 py-1 rounded-md hover:bg-white/20 transition-colors">
            Kangra Orthodox Tea
          </Link>
          <Link to="/shop?category=honey-and-preserves" className="px-2.5 py-1 rounded-md hover:bg-white/20 transition-colors">
            Wild Forest Honey
          </Link>
          <Link to="/shop?category=cold-pressed-oils" className="px-2.5 py-1 rounded-md hover:bg-white/20 transition-colors">
            Cold-Pressed Oils
          </Link>
          <Link to="/shop?category=spices-and-staples" className="px-2.5 py-1 rounded-md hover:bg-white/20 transition-colors">
            Spices & Staples
          </Link>
          <Link to="/shop?category=knitwear" className="px-2.5 py-1 rounded-md hover:bg-white/20 transition-colors">
            Knitwear
          </Link>
          <Link to="/shop?category=gifting" className="px-2.5 py-1 rounded-md hover:bg-white/20 transition-colors font-semibold text-terra">
            Curated Gifting
          </Link>
          <span className="opacity-30 hidden lg:inline">|</span>
          <Link to="/makers" className="hidden lg:inline-block px-2.5 py-1 rounded-md hover:bg-white/20 transition-colors">
            Meet the Makers
          </Link>
          <Link to="/sourcing" className="hidden lg:inline-block px-2.5 py-1 rounded-md hover:bg-white/20 transition-colors">
            The Sourcing Standard
          </Link>
          <Link to="/about" className="hidden xl:inline-block px-2.5 py-1 rounded-md hover:bg-white/20 transition-colors">
            Our Story
          </Link>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 top-[72px] z-50 flex flex-col bg-surface/98 backdrop-blur-md px-6 py-6 lg:hidden fade-in overflow-y-auto">
          <nav className="flex flex-col space-y-1" aria-label="Mobile">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className="border-b border-line/70 py-4 font-serif text-2xl text-forest hover:text-terra transition-colors"
              >
                {item.label}
              </Link>
            ))}
            <div className="pt-6 space-y-4">
              <Link
                to="/account/wishlist"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-between text-sm font-medium text-ink py-2"
              >
                <span>Saved items</span>
                <span className="text-xs text-muted">View wishlist →</span>
              </Link>
              <Link
                to="/account"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-between text-sm font-medium text-ink py-2"
              >
                <span>Customer Account</span>
                <span className="text-xs text-muted">Orders & addresses →</span>
              </Link>
              {user?.roles.includes('admin') ? (
                <Link
                  to="/admin"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-between text-sm font-semibold text-forest bg-forest/5 rounded px-3 py-2.5 border border-forest/20"
                >
                  <span>Administration Portal</span>
                  <span className="text-xs text-forest">Dashboard →</span>
                </Link>
              ) : null}
              <Link
                to="/sell"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-between text-sm font-medium text-terra py-2"
              >
                <span>Sell on PAHADI ROOTS</span>
                <span className="text-xs text-terra">Apply to join →</span>
              </Link>
            </div>
            <div className="pt-8 mt-auto border-t border-line text-xs text-muted">
              <p>PAHADI ROOTS — Rooted in Himachal Pradesh</p>
              <p className="mt-1">Crafted with care for authentic mountain goods.</p>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
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
            I agree to receive occasional dispatches from PAHADI ROOTS.
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
              A curated marketplace for products made and grown in Himachal Pradesh. Every listing names the artisan or
              grower, and provenance claims are verified before publication.
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
              <li><Link to="/policies/authenticity" className="hover:text-sand transition-colors">Authenticity guarantee</Link></li>
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
              © {new Date().getFullYear()} PAHADI ROOTS. Demonstration build — policy documents are drafts pending legal
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

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

export function PublicLayout() {
  const { config } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <ScrollToTop />
      {config?.devMode ? (
        <div className="bg-[#b9694c] px-3 py-1 text-center text-[10px] font-medium tracking-[0.05em] text-white">
          Development build · demonstration data
          {config.payments.devPaymentsEnabled ? ' · simulated payments enabled' : ''}
        </div>
      ) : null}
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export { Wordmark };
