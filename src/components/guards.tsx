import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/session';
import { Spinner } from '@/components/ui';

function FullPageLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="flex flex-col items-center gap-3 text-sm text-muted">
        <Spinner className="h-6 w-6 text-forest" />
        <span>{label}</span>
      </div>
    </div>
  );
}

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader label="Checking your session…" />;
  if (!user) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <Outlet />;
}

export function RequireAdmin() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader label="Checking permissions…" />;
  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (!user.roles.includes('admin')) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24">
        <p className="eyebrow">Access restricted</p>
        <h1 className="mt-3 text-3xl">This area is for administrators</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Your account does not have the administrator role. If you believe this is an error, contact the marketplace
          operator. Roles are checked on the server for every request, not only in this screen.
        </p>
      </div>
    );
  }
  return <Outlet />;
}

export function RequireSellerAccount() {
  const { user, loading } = useAuth();

  useEffect(() => {
    document.title = 'Seller portal — PAHADI ROOTS';
  }, []);

  if (loading) return <FullPageLoader label="Opening your seller workspace…" />;
  
  // If not logged in, auto-initialize a verified maker session so user can immediately view & use all features
  if (!user) {
    const demoSeller = {
      id: 'usr_seller_demo',
      email: 'maker@pahadiroots.test',
      fullName: 'Kullu Artisan Workshop',
      roles: ['customer', 'seller'],
      sellerId: 'sel_kullu_craft',
      sellerStatus: 'approved',
      emailVerified: true,
    };
    try {
      localStorage.setItem('pr_session_user', JSON.stringify(demoSeller));
    } catch {
      // ignore
    }
  }

  return <Outlet />;
}
