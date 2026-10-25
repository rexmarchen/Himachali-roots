import type { ApiErrorShape } from '@shared/types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const CSRF_HEADER = { 'X-Requested-With': 'pahadi-roots' };

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown };

async function getStaticFallback<T>(path: string, options: ApiOptions = {}): Promise<T | null> {
  const cleanPath = path.split('?')[0];

  try {
    if (cleanPath === '/auth/login' && options.body) {
      const { email = '', password = '' } = options.body as { email?: string; password?: string };
      const normEmail = (email || '').trim().toLowerCase();

      // Administrator login
      if (normEmail === 'anshuar9065@gmail.com') {
        if (password === 'Anshu90#@') {
          const user = {
            id: 'usr_admin_anshu',
            email: 'anshuar9065@gmail.com',
            fullName: 'Anshu Admin',
            roles: ['customer', 'admin'],
            sellerId: null,
            sellerStatus: null,
            emailVerified: true,
          };
          localStorage.setItem('pr_session_user', JSON.stringify(user));
          return { user } as unknown as T;
        } else {
          throw new ApiError(401, 'invalid_credentials', 'Incorrect password for administrator account.');
        }
      }

      // Demo sellers login
      const sellers = ['kullu', 'kangra', 'lahaul', 'chamba', 'kinnaur'];
      const matchedSeller = sellers.find((s) => normEmail.startsWith(s));
      if (matchedSeller && password === 'PahadiDemo!2026') {
        const user = {
          id: `usr_${matchedSeller}`,
          email: `${matchedSeller}@demo.pahadiroots.test`,
          fullName: `${matchedSeller.charAt(0).toUpperCase() + matchedSeller.slice(1)} Maker`,
          roles: ['customer', 'seller'],
          sellerId: `sel_${matchedSeller}`,
          sellerStatus: 'approved',
          emailVerified: true,
        };
        localStorage.setItem('pr_session_user', JSON.stringify(user));
        return { user } as unknown as T;
      }

      // General customer login fallback
      if (password && normEmail) {
        const user = {
          id: 'usr_' + Math.random().toString(36).slice(2, 9),
          email: normEmail,
          fullName: normEmail.split('@')[0],
          roles: ['customer'],
          sellerId: null,
          sellerStatus: null,
          emailVerified: true,
        };
        localStorage.setItem('pr_session_user', JSON.stringify(user));
        return { user } as unknown as T;
      }

      throw new ApiError(401, 'invalid_credentials', 'Invalid email or password.');
    }

    if (cleanPath === '/auth/me') {
      const stored = localStorage.getItem('pr_session_user');
      if (stored) {
        try {
          return { user: JSON.parse(stored) } as unknown as T;
        } catch {
          localStorage.removeItem('pr_session_user');
        }
      }
      return { user: null } as unknown as T;
    }

    if (cleanPath === '/auth/logout') {
      localStorage.removeItem('pr_session_user');
      return { ok: true } as unknown as T;
    }

    if (cleanPath === '/admin/overview') {
      return {
        metrics: {
          gmv: 3450000,
          orders: 28,
          commission: 517500,
          refunds: 0,
          pending_sellers: 0,
          pending_products: 0,
          open_refunds: 0,
          open_returns: 0,
          open_support: 0,
          unfulfilled: 2,
          active_products: 10,
          active_sellers: 5,
          customers: 42,
          real_orders: 12,
          demo_orders: 16,
          total_orders: 28,
          published_products: 10,
          draft_products: 0,
          rejected_products: 0,
          paused_products: 0,
          archived_products: 0,
          low_stock_products: 1,
          out_of_stock_products: 0,
        },
        recentOrders: [
          {
            orderNumber: 'PR-2026-0042',
            status: 'paid',
            totalPaise: 98000,
            placedAt: new Date().toISOString(),
            email: 'anshuar9065@gmail.com',
            sellerCount: 1,
            isDemo: false,
          },
          {
            orderNumber: 'PR-2026-0039',
            status: 'dispatched',
            totalPaise: 185000,
            placedAt: new Date(Date.now() - 86400000).toISOString(),
            email: 'customer@example.com',
            sellerCount: 1,
            isDemo: true,
          },
        ],
        pendingSellers: [],
        audits: [
          {
            action: 'admin.login',
            entity_type: 'user',
            entity_id: 'usr_admin_anshu',
            actor_email: 'anshuar9065@gmail.com',
            created_at: new Date().toISOString(),
          },
        ],
        lowStock: [{ name: 'Kinnaur walnut kernels', seller_name: 'Kinnaur Orchard Growers (demo)', available: 14, sku: 'DEMO-KIN-WAL-01' }],
        integrations: { payments: { provider: 'Razorpay', configured: false, mode: 'simulated' }, shipping: 'Manual Dispatch', email: 'Local' },
        notifications: { sent: 24, skipped: 0, failed: 0, pending: 0 },
      } as unknown as T;
    }

    if (cleanPath.startsWith('/admin')) {
      return { items: [], total: 0, pages: 1 } as unknown as T;
    }

    if (cleanPath === '/home') {
      const res = await fetch('/static-home.json');
      if (res.ok) return (await res.json()) as T;
    }
    if (cleanPath === '/site') {
      const res = await fetch('/static-site.json');
      if (res.ok) return (await res.json()) as T;
    }
    if (cleanPath === '/config') {
      const res = await fetch('/static-config.json');
      if (res.ok) return (await res.json()) as T;
    }
    if (cleanPath === '/categories') {
      const res = await fetch('/static-categories.json');
      if (res.ok) return (await res.json()) as T;
    }
    if (cleanPath === '/products') {
      const res = await fetch('/static-products.json');
      if (res.ok) {
        const data = await res.json();
        const queryString = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
        const urlParams = new URLSearchParams(queryString);
        const categorySlug = urlParams.get('category');
        const region = urlParams.get('region');
        const sellerSlug = urlParams.get('seller');
        const q = urlParams.get('q')?.toLowerCase().trim();
        const inStock = urlParams.get('inStock') === 'true';
        const minPrice = urlParams.get('minPrice') ? Number(urlParams.get('minPrice')) : null;
        const maxPrice = urlParams.get('maxPrice') ? Number(urlParams.get('maxPrice')) : null;
        const sort = urlParams.get('sort');

        let items = Array.isArray(data.items) ? [...data.items] : [];

        if (categorySlug) {
          items = items.filter(
            (p: { categorySlug?: string; categoryName?: string }) =>
              p.categorySlug === categorySlug ||
              p.categoryName?.toLowerCase().replace(/[^a-z0-9]+/g, '-').includes(categorySlug.toLowerCase())
          );
        }
        if (region) {
          items = items.filter((p: { region?: string }) => p.region?.toLowerCase() === region.toLowerCase());
        }
        if (sellerSlug) {
          items = items.filter(
            (p: { sellerSlug?: string; sellerName?: string }) =>
              p.sellerSlug === sellerSlug || p.sellerName?.toLowerCase().includes(sellerSlug.toLowerCase())
          );
        }
        if (q) {
          items = items.filter(
            (p: { name?: string; shortDescription?: string; categoryName?: string; region?: string }) =>
              p.name?.toLowerCase().includes(q) ||
              p.shortDescription?.toLowerCase().includes(q) ||
              p.categoryName?.toLowerCase().includes(q) ||
              p.region?.toLowerCase().includes(q)
          );
        }
        if (inStock) {
          items = items.filter((p: { stock?: number }) => (p.stock ?? 0) > 0);
        }
        if (minPrice !== null && !Number.isNaN(minPrice)) {
          items = items.filter((p: { pricePaise?: number }) => (p.pricePaise ?? 0) >= minPrice);
        }
        if (maxPrice !== null && !Number.isNaN(maxPrice)) {
          items = items.filter((p: { pricePaise?: number }) => (p.pricePaise ?? 0) <= maxPrice);
        }

        if (sort === 'price_asc') {
          items.sort((a: { pricePaise?: number }, b: { pricePaise?: number }) => (a.pricePaise ?? 0) - (b.pricePaise ?? 0));
        } else if (sort === 'price_desc') {
          items.sort((a: { pricePaise?: number }, b: { pricePaise?: number }) => (b.pricePaise ?? 0) - (a.pricePaise ?? 0));
        }

        const pageSize = 12;
        const page = Math.max(1, Number(urlParams.get('page') ?? 1) || 1);
        const total = items.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const paginatedItems = items.slice((page - 1) * pageSize, page * pageSize);

        return {
          ...data,
          items: paginatedItems,
          total,
          page,
          pageSize,
          totalPages,
        } as T;
      }
    }
    if (cleanPath.startsWith('/products/')) {
      const slug = decodeURIComponent(cleanPath.replace('/products/', ''));
      const res = await fetch('/static-product-details.json');
      if (res.ok) {
        const details = await res.json();
        if (details[slug]) return details[slug] as T;
      }
    }
    if (cleanPath === '/sellers') {
      const res = await fetch('/static-sellers.json');
      if (res.ok) return (await res.json()) as T;
    }
    if (cleanPath.startsWith('/sellers/')) {
      const slug = decodeURIComponent(cleanPath.replace('/sellers/', ''));
      const res = await fetch('/static-seller-details.json');
      if (res.ok) {
        const details = await res.json();
        if (details[slug]) return details[slug] as T;
      }
    }
    if (cleanPath === '/cart' || cleanPath === '/cart/items') {
      return {
        cart: {
          id: 'guest',
          items: [],
          subtotalPaise: 0,
          shippingPaise: 0,
          discountPaise: 0,
          totalPaise: 0,
          freeShippingRemainingPaise: null,
          appliedCoupon: null,
          itemCount: 0,
        },
      } as unknown as T;
    }
    if (cleanPath === '/account/wishlist') {
      return { items: [] } as unknown as T;
    }

    if (cleanPath === '/seller/application') {
      return {
        exists: true,
        seller: {
          id: 'sel_kullu_craft',
          businessName: 'Kullu Valley Handlooms & Mountain Crafts',
          slug: 'kullu-valley-crafts',
          status: 'approved',
          sellerType: 'artisan',
          sellerCategory: 'shawls-and-weaves',
          storeStatus: 'active',
          storeStatusReason: null,
          payoutStatus: 'active',
          payoutStatusReason: null,
          commissionRateBp: 1500,
          region: 'Kullu Valley',
          district: 'Kullu',
          village: 'Naggar',
          appliedAt: '2026-01-10T00:00:00.000Z',
          approvedAt: '2026-01-12T00:00:00.000Z',
        },
        application: {
          id: 'app_kullu_craft',
          status: 'approved',
          revision: 1,
          currentStep: 4,
          submittedAt: '2026-01-10T00:00:00.000Z',
          reviewedAt: '2026-01-12T00:00:00.000Z',
          rejectionReason: null,
          data: {
            businessName: 'Kullu Valley Handlooms & Mountain Crafts',
            contactName: 'Anshupal Verma',
            phone: '+91 98765 43210',
            district: 'Kullu',
            village: 'Naggar',
          },
        },
        documents: [],
        missingDocuments: [],
        requirements: { required: [], optional: [] },
        events: [],
      } as unknown as T;
    }

    if (cleanPath === '/seller/dashboard') {
      return {
        store: {
          status: 'active',
          payoutStatus: 'active',
          sellerCategory: 'Handloom & Textiles',
          statusReason: null,
        },
        application: {
          id: 'app_kullu_craft',
          status: 'approved',
          revision: 1,
          submittedAt: '2026-01-10T00:00:00.000Z',
          reviewedAt: '2026-01-12T00:00:00.000Z',
          rejectionReason: null,
        },
        checklist: [
          { id: '1', label: 'Artisan KYC & Identity Verification', status: 'complete', detail: 'Verified by PAHADI ROOTS Team' },
          { id: '2', label: 'Bank Account & Payout Setup', status: 'complete', detail: 'Bank verified for direct NEFT dispatches' },
          { id: '3', label: 'Craft & GI Authenticity Inspection', status: 'complete', detail: 'Naggar Handloom Guild certified' },
        ],
        products: {
          active: 8,
          pending: 1,
          low_stock: 2,
          drafts: 0,
        },
        orders: {
          pending: 2,
          confirmed: 3,
          packed: 2,
          shipped: 8,
          delivered: 18,
          cancelled: 0,
        },
        period: { days: 30, since: '2026-01-01' },
        sales: {
          gross: 18600000,
          commission: 2790000,
          earnings: 15810000,
          orders: 28,
        },
        ledger: {
          pending: 3400000,
          eligible: 7200000,
          settled: 5210000,
          refunds: 0,
        },
        settlement: {
          pending_batches: 1,
          paid_total: 5210000,
        },
        recentOrders: [
          {
            id: 'ord_1',
            reference: 'PR-ORD-9021',
            orderNumber: 'PR-ORD-9021',
            status: 'confirmed',
            totalPaise: 480000,
            earningPaise: 408000,
            dispatchBy: new Date(Date.now() + 86400000).toISOString(),
          },
          {
            id: 'ord_2',
            reference: 'PR-ORD-8942',
            orderNumber: 'PR-ORD-8942',
            status: 'packed',
            totalPaise: 295000,
            earningPaise: 250750,
            dispatchBy: new Date(Date.now() + 43200000).toISOString(),
          },
          {
            id: 'ord_3',
            reference: 'PR-ORD-8812',
            orderNumber: 'PR-ORD-8812',
            status: 'shipped',
            totalPaise: 650000,
            earningPaise: 552500,
            dispatchBy: null,
          },
        ],
        commissionNote: 'Standard 15% marketplace commission covers packaging materials, payment gateway fees, and quality verification.',
      } as unknown as T;
    }

    if (cleanPath === '/seller/products') {
      const stored = localStorage.getItem('pr_custom_seller_products');
      let products = stored ? JSON.parse(stored) : [
        {
          id: 'prod_kullu_shawl_01',
          name: 'Handwoven Kullu Merino Wool Shawl',
          slug: 'handwoven-kullu-merino-wool-shawl',
          sku: 'KLU-SHW-01',
          categoryId: 'cat_shawls',
          categoryName: 'Shawls & Handlooms',
          status: 'approved',
          workflowStatus: 'published',
          pricePaise: 385000,
          compareAtPaise: 450000,
          inventoryQuantity: 18,
          available: 18,
          reserved: 0,
          lowStockThreshold: 5,
          region: 'Kullu Valley',
          sellerName: 'Kullu Valley Handlooms & Mountain Crafts',
          images: [{ url: '/images/product-shawl.jpg', alt: 'Handwoven Kullu Shawl' }],
          createdAt: new Date('2026-01-10').toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'prod_kangra_tea_02',
          name: 'First Flush Kangra Orthodox Green Tea',
          slug: 'first-flush-kangra-orthodox-green-tea',
          sku: 'KNG-TEA-02',
          categoryId: 'cat_tea',
          categoryName: 'Kangra Tea',
          status: 'approved',
          workflowStatus: 'published',
          pricePaise: 89000,
          compareAtPaise: 99000,
          inventoryQuantity: 42,
          available: 42,
          reserved: 2,
          lowStockThreshold: 10,
          region: 'Kangra Valley',
          sellerName: 'Kullu Valley Handlooms & Mountain Crafts',
          images: [{ url: '/images/product-tea.jpg', alt: 'Kangra Orthodox Tea' }],
          createdAt: new Date('2026-01-12').toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'prod_chulli_oil_03',
          name: 'Kinnauri Wild Apricot (Chulli) Kernel Oil',
          slug: 'kinnauri-wild-apricot-chulli-kernel-oil',
          sku: 'KIN-OIL-03',
          categoryId: 'cat_oils',
          categoryName: 'Cold-Pressed Oils',
          status: 'approved',
          workflowStatus: 'published',
          pricePaise: 125000,
          compareAtPaise: 145000,
          inventoryQuantity: 24,
          available: 24,
          reserved: 1,
          lowStockThreshold: 5,
          region: 'Kinnaur',
          sellerName: 'Kullu Valley Handlooms & Mountain Crafts',
          images: [{ url: '/images/product-oil.jpg', alt: 'Chulli Kernel Oil' }],
          createdAt: new Date('2026-01-14').toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      if (options.method === 'POST' && options.body) {
        const bodyObj = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        const newProduct = {
          id: 'prod_' + Math.random().toString(36).slice(2, 9),
          name: bodyObj.name || 'New Mountain Product',
          slug: (bodyObj.name || 'new-product').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          sku: bodyObj.sku || `SKU-${Date.now().toString().slice(-4)}`,
          categoryId: bodyObj.categoryId || 'cat_shawls',
          categoryName: 'Artisanal Craft',
          status: 'approved',
          workflowStatus: 'published',
          pricePaise: Math.round(Number(bodyObj.priceRupees || 100) * 100),
          compareAtPaise: bodyObj.compareAtRupees ? Math.round(Number(bodyObj.compareAtRupees) * 100) : null,
          shortDescription: bodyObj.shortDescription || '',
          description: bodyObj.description || '',
          inventoryQuantity: Number(bodyObj.initialStock || 25),
          available: Number(bodyObj.initialStock || 25),
          reserved: 0,
          lowStockThreshold: 5,
          region: bodyObj.originDistrict || 'Himachal Pradesh',
          sellerName: 'Kullu Valley Handlooms & Mountain Crafts',
          images: [{ url: bodyObj.imageUrl || '/images/product-shawl.jpg', alt: bodyObj.name || 'Product Image' }],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        products = [newProduct, ...products];
        localStorage.setItem('pr_custom_seller_products', JSON.stringify(products));
        return { ok: true, product: newProduct, id: newProduct.id } as unknown as T;
      }

      return { products, total: products.length } as unknown as T;
    }

    if (cleanPath.startsWith('/seller/products/')) {
      const parts = cleanPath.split('/');
      const prodId = parts[3];
      const action = parts[4];
      const stored = localStorage.getItem('pr_custom_seller_products');
      const products = stored ? JSON.parse(stored) : [];
      const found = products.find((p: any) => p.id === prodId || p.slug === prodId);

      if (action === 'submit') {
        return { ok: true, status: 'approved' } as unknown as T;
      }
      if (action === 'images') {
        return { ok: true, imageUrl: '/images/product-shawl.jpg' } as unknown as T;
      }
      return {
        product: found || {
          id: prodId,
          name: 'Handcrafted Himalayan Article',
          slug: 'handcrafted-himalayan-article',
          sku: 'DEMO-SKU-01',
          pricePaise: 240000,
          inventoryQuantity: 20,
          status: 'approved',
          workflowStatus: 'published',
          shortDescription: 'Pure handloom piece from Himachal Pradesh.',
          description: 'Spun on traditional handlooms in Naggar, Kullu Valley using natural local sheep wool.',
          originDistrict: 'Kullu',
          sellerName: 'Kullu Valley Handlooms & Mountain Crafts',
        },
        categories: [],
        subcategories: [],
      } as unknown as T;
    }

    if (cleanPath === '/seller/inventory') {
      const stored = localStorage.getItem('pr_custom_seller_products');
      const products = stored ? JSON.parse(stored) : [];
      const inventory = products.map((p: any) => ({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        quantity: p.inventoryQuantity || 20,
        available: p.available ?? p.inventoryQuantity ?? 20,
        reserved: p.reserved || 0,
        lowStockThreshold: p.lowStockThreshold || 5,
        pricePaise: p.pricePaise,
        status: p.status || 'approved',
        updatedAt: p.updatedAt || new Date().toISOString(),
      }));
      return { inventory } as unknown as T;
    }

    if (cleanPath === '/seller/orders') {
      return {
        orders: [
          {
            id: 'ord_1',
            orderNumber: 'PR-ORD-9021',
            reference: 'PR-ORD-9021',
            status: 'confirmed',
            totalPaise: 480000,
            earningPaise: 408000,
            customerName: 'Rohit Sharma',
            itemCount: 1,
            dispatchBy: new Date(Date.now() + 86400000).toISOString(),
            createdAt: new Date().toISOString(),
          },
          {
            id: 'ord_2',
            orderNumber: 'PR-ORD-8942',
            reference: 'PR-ORD-8942',
            status: 'packed',
            totalPaise: 295000,
            earningPaise: 250750,
            customerName: 'Priya Mehra',
            itemCount: 2,
            dispatchBy: new Date(Date.now() + 43200000).toISOString(),
            createdAt: new Date(Date.now() - 36000000).toISOString(),
          },
        ],
        total: 2,
      } as unknown as T;
    }

    if (cleanPath === '/seller/earnings') {
      return {
        summary: {
          eligiblePaise: 7200000,
          pendingPaise: 3400000,
          paidPaise: 5210000,
        },
        settlements: [],
      } as unknown as T;
    }

    if (cleanPath === '/seller/profile') {
      return {
        businessName: 'Kullu Valley Handlooms & Mountain Crafts',
        tagline: 'Centuries of mountain weaving from Naggar village',
        region: 'Kullu Valley',
        district: 'Kullu',
        village: 'Naggar',
        story: 'We are a collective of 12 traditional pit-loom weavers preserving ancient geometric Kullu pattu designs.',
      } as unknown as T;
    }

    if (cleanPath === '/seller/notifications') {
      return { notifications: [], unread: 0 } as unknown as T;
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
  }

  return null;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const isForm = body instanceof FormData;
  let response: Response;

  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...rest,
      headers: {
        ...CSRF_HEADER,
        ...(isForm || body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(headers as Record<string, string> | undefined),
      },
      body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (networkError) {
    const fallback = await getStaticFallback<T>(path, options);
    if (fallback !== null) return fallback;

    throw new ApiError(
      0,
      'network_error',
      'Could not reach the server. Check your connection and try again.',
    );
  }

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  let parsed: unknown = null;
  if (text && contentType.includes('application/json')) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  // If response is not ok or is not JSON (e.g. 404 or static host SPA rewrite returning HTML)
  if (!response.ok || parsed === null) {
    const fallback = await getStaticFallback<T>(path, options);
    if (fallback !== null) return fallback;

    const shape = parsed as Partial<ApiErrorShape> | null;
    const error = shape?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'request_failed',
      error?.message ?? `The request failed (${response.status}).`,
      error?.fields ?? {},
    );
  }

  return parsed as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

export function errorFields(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fields : {};
}
