import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { PublicLayout } from '@/components/PublicLayout';
import { RequireAdmin, RequireAuth, RequireSellerAccount } from '@/components/guards';

const HomePage = lazy(() => import('@/pages/HomePage').then((module) => ({ default: module.HomePage })));
const ShopPage = lazy(() => import('@/pages/ShopPage').then((module) => ({ default: module.ShopPage })));
const ProductPage = lazy(() => import('@/pages/ProductPage').then((module) => ({ default: module.ProductPage })));
const OfferPage = lazy(() => import('@/pages/OfferPage').then((module) => ({ default: module.OfferPage })));
const CartPage = lazy(() => import('@/pages/CartPage').then((module) => ({ default: module.CartPage })));
const CheckoutPage = lazy(() => import('@/pages/CheckoutPage').then((module) => ({ default: module.CheckoutPage })));

const LoginPage = lazy(() => import('@/pages/AuthPages').then((module) => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import('@/pages/AuthPages').then((module) => ({ default: module.RegisterPage })));
const ForgotPasswordPage = lazy(() =>
  import('@/pages/AuthPages').then((module) => ({ default: module.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import('@/pages/AuthPages').then((module) => ({ default: module.ResetPasswordPage })),
);
const VerifyEmailPage = lazy(() =>
  import('@/pages/AuthPages').then((module) => ({ default: module.VerifyEmailPage })),
);

const MakersPage = lazy(() => import('@/pages/PublicPages').then((module) => ({ default: module.MakersPage })));
const MakerDetailPage = lazy(() =>
  import('@/pages/PublicPages').then((module) => ({ default: module.MakerDetailPage })),
);
const AboutPage = lazy(() => import('@/pages/PublicPages').then((module) => ({ default: module.AboutPage })));
const SourcingPage = lazy(() => import('@/pages/PublicPages').then((module) => ({ default: module.SourcingPage })));
const FaqPage = lazy(() => import('@/pages/PublicPages').then((module) => ({ default: module.FaqPage })));
const ContactPage = lazy(() => import('@/pages/PublicPages').then((module) => ({ default: module.ContactPage })));
const CreditsPage = lazy(() => import('@/pages/PublicPages').then((module) => ({ default: module.CreditsPage })));
const PolicyPage = lazy(() => import('@/pages/PublicPages').then((module) => ({ default: module.PolicyPage })));
const SellPage = lazy(() => import('@/pages/PublicPages').then((module) => ({ default: module.SellPage })));
const NotFoundPage = lazy(() => import('@/pages/PublicPages').then((module) => ({ default: module.NotFoundPage })));

const AccountLayout = lazy(() =>
  import('@/pages/AccountPages').then((module) => ({ default: module.AccountLayout })),
);
const AccountOverviewPage = lazy(() =>
  import('@/pages/AccountPages').then((module) => ({ default: module.AccountOverviewPage })),
);
const OrdersPage = lazy(() => import('@/pages/AccountPages').then((module) => ({ default: module.OrdersPage })));
const OrderDetailPage = lazy(() =>
  import('@/pages/AccountPages').then((module) => ({ default: module.OrderDetailPage })),
);
const RequestsPage = lazy(() => import('@/pages/AccountPages').then((module) => ({ default: module.RequestsPage })));
const AddressesPage = lazy(() =>
  import('@/pages/AccountPages').then((module) => ({ default: module.AddressesPage })),
);
const WishlistPage = lazy(() =>
  import('@/pages/AccountPages').then((module) => ({ default: module.WishlistPage })),
);
const NotificationsPage = lazy(() =>
  import('@/pages/AccountPages').then((module) => ({ default: module.NotificationsPage })),
);
const ProfilePage = lazy(() => import('@/pages/AccountPages').then((module) => ({ default: module.ProfilePage })));

const SellerLayout = lazy(() => import('@/pages/SellerPages').then((module) => ({ default: module.SellerLayout })));
const SellerDashboardPage = lazy(() =>
  import('@/pages/SellerPages').then((module) => ({ default: module.SellerDashboardPage })),
);
const SellerProductsPage = lazy(() =>
  import('@/pages/SellerPages').then((module) => ({ default: module.SellerProductsPage })),
);
const SellerProductEditorPage = lazy(() =>
  import('@/pages/SellerPages').then((module) => ({ default: module.SellerProductEditorPage })),
);
const SellerOrdersPage = lazy(() =>
  import('@/pages/SellerPages').then((module) => ({ default: module.SellerOrdersPage })),
);
const SellerOrderDetailPage = lazy(() =>
  import('@/pages/SellerPages').then((module) => ({ default: module.SellerOrderDetailPage })),
);
const SellerEarningsPage = lazy(() =>
  import('@/pages/SellerPages').then((module) => ({ default: module.SellerEarningsPage })),
);
const SellerRequestsPage = lazy(() =>
  import('@/pages/SellerPages').then((module) => ({ default: module.SellerRequestsPage })),
);
const SellerProfilePage = lazy(() =>
  import('@/pages/SellerPages').then((module) => ({ default: module.SellerProfilePage })),
);
const SellerApplicationPage = lazy(() =>
  import('@/pages/SellerPages').then((module) => ({ default: module.SellerApplicationPage })),
);
const SellerInventoryPage = lazy(() =>
  import('@/pages/SellerPages').then((module) => ({ default: module.SellerInventoryPage })),
);
const SellerNotificationsPage = lazy(() =>
  import('@/pages/SellerPages').then((module) => ({ default: module.SellerNotificationsPage })),
);

const AdminLayout = lazy(() => import('@/pages/AdminPages').then((module) => ({ default: module.AdminLayout })));
const AdminOverviewPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminOverviewPage })),
);
const AdminSellersPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminSellersPage })),
);
const AdminSellerDetailPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminSellerDetailPage })),
);
const AdminProductsPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminProductsPage })),
);
const AdminProductDetailPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminProductDetailPage })),
);
const AdminCategoriesPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminCategoriesPage })),
);
const AdminOrdersPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminOrdersPage })),
);
const AdminOrderDetailPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminOrderDetailPage })),
);
const AdminPaymentsPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminPaymentsPage })),
);
const AdminRefundsPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminRefundsPage })),
);
const AdminReturnsPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminReturnsPage })),
);
const AdminCancellationsPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminCancellationsPage })),
);
const AdminCommissionsPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminCommissionsPage })),
);
const AdminSettlementsPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminSettlementsPage })),
);
const AdminCustomersPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminCustomersPage })),
);
const AdminReviewsPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminReviewsPage })),
);
const AdminContentPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminContentPage })),
);
const AdminCouponsPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminCouponsPage })),
);
const AdminCampaignsPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminCampaignsPage })),
);
const AdminSupportPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminSupportPage })),
);
const AdminAuditPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminAuditPage })),
);
const AdminSettingsPage = lazy(() =>
  import('@/pages/AdminPages').then((module) => ({ default: module.AdminSettingsPage })),
);

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-[#F7F3EB] px-6 py-24 text-center">
      <div>
        <p className="font-serif text-2xl text-[#243D32]">Gathering the page…</p>
        <p className="mt-2 text-sm text-[#6B6F68]">A moment while we bring this section in.</p>
      </div>
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="shop" element={<ShopPage />} />
        <Route path="shop/:slug" element={<ProductPage />} />
        <Route path="offers/:slug" element={<OfferPage />} />
        <Route path="products/:slug" element={<ProductPage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="makers" element={<MakersPage />} />
        <Route path="makers/:slug" element={<MakerDetailPage />} />
        <Route path="sellers/:slug" element={<MakerDetailPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="sourcing" element={<SourcingPage />} />
        <Route path="faq" element={<FaqPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="credits" element={<CreditsPage />} />
        <Route path="policies/:key" element={<PolicyPage />} />
        <Route path="sell" element={<SellPage />} />
        <Route path="become-a-maker" element={<SellPage />} />

        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />

        <Route element={<RequireAuth />}>
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="account" element={<AccountLayout />}>
            <Route index element={<AccountOverviewPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:orderNumber" element={<OrderDetailPage />} />
            <Route path="requests" element={<RequestsPage />} />
            <Route path="addresses" element={<AddressesPage />} />
            <Route path="wishlist" element={<WishlistPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route element={<RequireSellerAccount />}>
          <Route path="seller" element={<SellerLayout />}>
            <Route index element={<SellerDashboardPage />} />
            <Route path="application" element={<SellerApplicationPage />} />
            <Route path="inventory" element={<SellerInventoryPage />} />
            <Route path="notifications" element={<SellerNotificationsPage />} />
            <Route path="products" element={<SellerProductsPage />} />
            <Route path="products/new" element={<SellerProductEditorPage />} />
            <Route path="products/:id/edit" element={<SellerProductEditorPage />} />
            <Route path="orders" element={<SellerOrdersPage />} />
            <Route path="orders/:id" element={<SellerOrderDetailPage />} />
            <Route path="earnings" element={<SellerEarningsPage />} />
            <Route path="requests" element={<SellerRequestsPage />} />
            <Route path="profile" element={<SellerProfilePage />} />
            <Route path="analytics" element={<SellerDashboardPage />} />
            <Route path="shipping" element={<SellerOrdersPage />} />
          </Route>
        </Route>

        <Route element={<RequireAdmin />}>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminOverviewPage />} />
            <Route path="sellers" element={<AdminSellersPage />} />
            <Route path="sellers/:id" element={<AdminSellerDetailPage />} />
            <Route path="products" element={<AdminProductsPage />} />
            <Route path="products/:id" element={<AdminProductDetailPage />} />
            <Route path="categories" element={<AdminCategoriesPage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
            <Route path="orders/:orderNumber" element={<AdminOrderDetailPage />} />
            <Route path="payments" element={<AdminPaymentsPage />} />
            <Route path="refunds" element={<AdminRefundsPage />} />
            <Route path="returns" element={<AdminReturnsPage />} />
            <Route path="cancellations" element={<AdminCancellationsPage />} />
            <Route path="commissions" element={<AdminCommissionsPage />} />
            <Route path="settlements" element={<AdminSettlementsPage />} />
            <Route path="customers" element={<AdminCustomersPage />} />
            <Route path="reviews" element={<AdminReviewsPage />} />
            <Route path="content" element={<AdminContentPage />} />
            <Route path="coupons" element={<AdminCouponsPage />} />
            <Route path="campaigns" element={<AdminCampaignsPage />} />
            <Route path="support" element={<AdminSupportPage />} />
            <Route path="audit" element={<AdminAuditPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
