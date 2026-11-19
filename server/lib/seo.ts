import type { Db } from '../db.js';
import { queryOne } from '../db.js';
import { env } from '../env.js';
import { BLOG_POSTS } from '../../shared/blog.js';

export interface SeoMetadata {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl?: string;
  ogType?: 'website' | 'product' | 'article' | 'profile';
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
  noindex?: boolean;
}

const DEFAULT_ORIGIN = 'https://www.dearhills.in';
const DEFAULT_IMAGE = `${DEFAULT_ORIGIN}/images/home/kalpa-dawn-1100.jpg`;
const DEFAULT_TITLE = 'DEAR HILLS — Authentic Himalayan Handloom, Organic Harvest & Mountain Goods';
const DEFAULT_DESCRIPTION =
  'Curated marketplace for authentic products made and grown in Himachal Pradesh — handloom shawls, Kangra tea, raw honey, orchard fruits and traditional crafts.';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanText(text: string | null | undefined, maxLength = 160): string {
  if (!text) return '';
  const clean = text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength - 1).trim() + '…';
}

function resolveOrigin(hostHeader?: string): string {
  if (env.isProduction) return DEFAULT_ORIGIN;
  if (!hostHeader) return env.appUrl.startsWith('http') ? env.appUrl : DEFAULT_ORIGIN;
  if (hostHeader.includes('dearhills.in')) return DEFAULT_ORIGIN;
  return `http://${hostHeader}`;
}

export function getSeoMetadata(
  db: Db,
  pathname: string,
  hostHeader?: string,
  queryParams?: Record<string, string | undefined>,
): SeoMetadata {
  const origin = resolveOrigin(hostHeader);
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';

  // Private routes: mark noindex
  if (
    normalizedPath.startsWith('/account') ||
    normalizedPath.startsWith('/admin') ||
    normalizedPath.startsWith('/seller') ||
    normalizedPath.startsWith('/checkout') ||
    normalizedPath.startsWith('/onboarding') ||
    normalizedPath.startsWith('/login') ||
    normalizedPath.startsWith('/register') ||
    normalizedPath.startsWith('/reset-password') ||
    normalizedPath.startsWith('/verify-email')
  ) {
    return {
      title: 'Dear Hills',
      description: DEFAULT_DESCRIPTION,
      canonicalUrl: `${origin}${normalizedPath}`,
      noindex: true,
    };
  }

  // Single Product Route: /shop/:slug or /products/:slug
  const productMatch = normalizedPath.match(/^\/(?:shop|products)\/([^/]+)$/);
  if (productMatch) {
    const slug = productMatch[1];
    const product = queryOne<{
      id: string;
      name: string;
      slug: string;
      short_description: string | null;
      description: string | null;
      price_paise: number;
      sku: string | null;
      origin_place: string | null;
      materials: string | null;
      business_name: string;
      region: string | null;
      image_url: string | null;
    }>(
      db,
      `SELECT p.id, p.name, p.slug, p.short_description, p.description, p.price_paise, p.sku,
              p.origin_place, p.materials, s.business_name, s.region,
              (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order ASC LIMIT 1) as image_url
       FROM products p
       JOIN seller_profiles s ON s.id = p.seller_id
       WHERE p.slug = ? AND p.status = 'approved'`,
      slug,
    );

    if (product) {
      const title = `${product.name} — Authentic Handcrafted Himachal | Dear Hills`;
      const description =
        cleanText(product.short_description) ||
        cleanText(product.description) ||
        `Buy authentic ${product.name} crafted in ${product.origin_place || 'Himachal Pradesh'}. Genuine Himalayan quality on Dear Hills.`;
      const canonicalUrl = `${origin}/shop/${product.slug}`;
      const imageUrl = product.image_url
        ? product.image_url.startsWith('http')
          ? product.image_url
          : `${origin}${product.image_url}`
        : DEFAULT_IMAGE;

      const jsonLd = {
        '@context': 'https://schema.org/',
        '@type': 'Product',
        name: product.name,
        image: [imageUrl],
        description,
        sku: product.sku || product.id,
        brand: {
          '@type': 'Brand',
          name: 'Dear Hills',
        },
        countryOfOrigin: {
          '@type': 'Country',
          name: 'India',
        },
        offers: {
          '@type': 'Offer',
          url: canonicalUrl,
          priceCurrency: 'INR',
          price: (product.price_paise / 100).toFixed(2),
          priceValidUntil: '2027-12-31',
          availability: 'https://schema.org/InStock',
          itemCondition: 'https://schema.org/NewCondition',
          seller: {
            '@type': 'Organization',
            name: product.business_name,
          },
        },
        breadcrumb: {
          '@context': 'https://schema.org/',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: origin },
            { '@type': 'ListItem', position: 2, name: 'Shop', item: `${origin}/shop` },
            { '@type': 'ListItem', position: 3, name: product.name, item: canonicalUrl },
          ],
        },
      };

      return {
        title,
        description,
        canonicalUrl,
        imageUrl,
        ogType: 'product',
        jsonLd,
      };
    }
  }

  // Category Collection Route: /category/:slug, /categories/:slug, or /shop?category=:slug
  const categoryMatch = normalizedPath.match(/^\/(?:category|categories)\/([^/]+)$/);
  const categorySlug = categoryMatch ? categoryMatch[1] : (normalizedPath === '/shop' ? queryParams?.category : null);

  if (categorySlug) {
    const category = queryOne<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      image_url: string | null;
    }>(
      db,
      `SELECT id, name, slug, description, image_url FROM categories WHERE slug = ? AND is_active = 1`,
      categorySlug,
    );

    if (category) {
      const title = `${category.name} — Authentic Handcrafted Himachal Products | Dear Hills`;
      const description =
        cleanText(category.description) ||
        `Shop authentic ${category.name} handwoven and harvested across Himachal Pradesh. Direct from verified mountain artisans on Dear Hills.`;
      const canonicalUrl = `${origin}/categories/${category.slug}`;
      const imageUrl = category.image_url
        ? (category.image_url.startsWith('http') ? category.image_url : `${origin}${category.image_url}`)
        : `${origin}/images/product-shawl.jpg`;

      return {
        title,
        description,
        canonicalUrl,
        imageUrl,
        ogType: 'website',
        jsonLd: {
          '@context': 'https://schema.org/',
          '@type': 'CollectionPage',
          name: `${category.name} — Authentic Himachal Products`,
          url: canonicalUrl,
          description,
          breadcrumb: {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: origin },
              { '@type': 'ListItem', position: 2, name: 'Shop', item: `${origin}/shop` },
              { '@type': 'ListItem', position: 3, name: category.name, item: canonicalUrl },
            ],
          },
        },
      };
    }
  }

  // Shop Catalog: /shop
  if (normalizedPath === '/shop') {
    const canonicalUrl = `${origin}/shop`;
    return {
      title: 'Shop Authentic Himachal Handloom, Organic Foods & Mountain Crafts | Dear Hills',
      description:
        'Explore authentic handwoven Kullu shawls, orthodox Kangra tea, raw wildflower honey, Kinnaur walnuts, and mountain crafts directly from Himachal Pradesh artisans.',
      canonicalUrl,
      imageUrl: `${origin}/images/product-shawl.jpg`,
      ogType: 'website',
      jsonLd: {
        '@context': 'https://schema.org/',
        '@type': 'CollectionPage',
        name: 'Shop Authentic Himachal Handloom, Organic Foods & Mountain Crafts',
        url: canonicalUrl,
        description:
          'Explore authentic handwoven Kullu shawls, orthodox Kangra tea, raw wildflower honey, Kinnaur walnuts, and mountain crafts directly from Himachal Pradesh artisans.',
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: origin },
            { '@type': 'ListItem', position: 2, name: 'Shop', item: canonicalUrl },
          ],
        },
      },
    };
  }

  // Blog Post: /blog/:slug
  const blogMatch = normalizedPath.match(/^\/blog\/([^/]+)$/);
  if (blogMatch) {
    const slug = blogMatch[1];
    const post = BLOG_POSTS.find((p) => p.slug === slug);
    if (post) {
      const canonicalUrl = `${origin}/blog/${post.slug}`;
      const imageUrl = post.coverImage.startsWith('http')
        ? post.coverImage
        : `${origin}${post.coverImage}`;

      return {
        title: post.metaTitle,
        description: post.metaDescription,
        canonicalUrl,
        imageUrl,
        ogType: 'article',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.metaDescription,
          image: [imageUrl],
          datePublished: post.publishedAt,
          dateModified: post.publishedAt,
          author: {
            '@type': 'Person',
            name: post.author.name,
            jobTitle: post.author.role,
          },
          publisher: {
            '@type': 'Organization',
            name: 'Dear Hills',
            logo: {
              '@type': 'ImageObject',
              url: `${origin}/favicon.svg`,
            },
          },
          mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': canonicalUrl,
          },
        },
      };
    }
  }

  // Blog Index: /blog
  if (normalizedPath === '/blog') {
    const canonicalUrl = `${origin}/blog`;
    return {
      title: 'Himalayan Journal & Craft Stories | Dear Hills Blog',
      description:
        'Guides and stories celebrating authentic Himachal living — how to identify pure Pahadi honey, Kullu vs Kinnauri shawl weaving, and buying guide for authentic mountain goods.',
      canonicalUrl,
      imageUrl: DEFAULT_IMAGE,
      ogType: 'website',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: 'Dear Hills Mountain Journal',
        url: canonicalUrl,
        description:
          'Stories, cultural guides, and sourcing notes from the high-altitude valleys of Himachal Pradesh.',
        publisher: {
          '@type': 'Organization',
          name: 'Dear Hills',
          logo: `${origin}/favicon.svg`,
        },
      },
    };
  }

  // Maker profile: /makers/:slug
  const makerMatch = normalizedPath.match(/^\/makers\/([^/]+)$/);
  if (makerMatch) {
    const slug = makerMatch[1];
    const seller = queryOne<{
      business_name: string;
      slug: string;
      story: string | null;
      region: string | null;
      village: string | null;
      seller_category: string | null;
      logo_url: string | null;
    }>(
      db,
      `SELECT business_name, slug, story, region, village, seller_category, logo_url
       FROM seller_profiles
       WHERE slug = ? AND status = 'approved'`,
      slug,
    );

    if (seller) {
      const title = `${seller.business_name} — Mountain Artisan Story | Dear Hills`;
      const description =
        cleanText(seller.story) ||
        `Meet ${seller.business_name} from ${seller.region || 'Himachal Pradesh'}. Crafting authentic mountain goods with generational heritage on Dear Hills.`;
      const canonicalUrl = `${origin}/makers/${seller.slug}`;
      const imageUrl = seller.logo_url
        ? seller.logo_url.startsWith('http')
          ? seller.logo_url
          : `${origin}${seller.logo_url}`
        : DEFAULT_IMAGE;

      return {
        title,
        description,
        canonicalUrl,
        imageUrl,
        ogType: 'profile',
        jsonLd: {
          '@context': 'https://schema.org/',
          '@type': 'Person',
          name: seller.business_name,
          jobTitle: seller.seller_category || 'Himalayan Artisan',
          address: {
            '@type': 'PostalAddress',
            addressLocality: seller.village || seller.region || 'Himachal Pradesh',
            addressRegion: 'Himachal Pradesh',
            addressCountry: 'India',
          },
          description,
        },
      };
    }
  }

  // Makers list: /makers
  if (normalizedPath === '/makers') {
    const canonicalUrl = `${origin}/makers`;
    return {
      title: 'Meet the Mountain Makers & Artisans of Himachal Pradesh | Dear Hills',
      description:
        'Discover the generational weavers, tea planters, beekeepers, and woodworkers crafting heritage goods across the valleys of Himachal Pradesh.',
      canonicalUrl,
      imageUrl: DEFAULT_IMAGE,
      ogType: 'website',
    };
  }

  // About / Our Story
  if (normalizedPath === '/about' || normalizedPath === '/our-story') {
    const canonicalUrl = `${origin}/about`;
    return {
      title: 'Our Story & Philosophy — Preserving Himalayan Living Heritage | Dear Hills',
      description:
        'Dear Hills connects conscious global buyers with authentic Himalayan artisans, weavers, and organic farmers in Himachal Pradesh with verified provenance and fair pay.',
      canonicalUrl,
      imageUrl: DEFAULT_IMAGE,
      ogType: 'article',
    };
  }

  // How We Source
  if (normalizedPath === '/sourcing') {
    const canonicalUrl = `${origin}/sourcing`;
    return {
      title: 'How We Source — Pure Alpine Origin & Ethical Provenance | Dear Hills',
      description:
        'Every shawl, tea harvest, honey jar, and handloom piece is verified at source in the mountain valleys of Himachal Pradesh.',
      canonicalUrl,
      imageUrl: DEFAULT_IMAGE,
      ogType: 'article',
    };
  }

  // Default: Homepage
  const canonicalUrl = `${origin}/`;
  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    canonicalUrl,
    imageUrl: DEFAULT_IMAGE,
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': `${origin}/#organization`,
          name: 'Dear Hills',
          url: origin,
          logo: `${origin}/favicon.svg`,
          description: DEFAULT_DESCRIPTION,
          address: {
            '@type': 'PostalAddress',
            addressRegion: 'Himachal Pradesh',
            addressCountry: 'IN',
          },
        },
        {
          '@type': 'WebSite',
          '@id': `${origin}/#website`,
          url: origin,
          name: 'Dear Hills',
          publisher: {
            '@id': `${origin}/#organization`,
          },
          potentialAction: {
            '@type': 'SearchAction',
            target: {
              '@type': 'EntryPoint',
              urlTemplate: `${origin}/shop?q={search_term_string}`,
            },
            'query-input': 'required name=search_term_string',
          },
        },
      ],
    },
  };
}

export function injectSeoIntoHtml(html: string, seo: SeoMetadata): string {
  let result = html;

  // Replace <title>
  result = result.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(seo.title)}</title>`);

  // Replace or inject <meta name="description">
  if (result.includes('name="description"')) {
    result = result.replace(
      /<meta\s+name="description"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta name="description" content="${escapeHtml(seo.description)}" />`,
    );
  } else {
    result = result.replace('</head>', `  <meta name="description" content="${escapeHtml(seo.description)}" />\n</head>`);
  }

  // Replace Open Graph tags
  result = result.replace(
    /<meta\s+property="og:title"\s+content="[\s\S]*?"\s*\/?>/i,
    `<meta property="og:title" content="${escapeHtml(seo.title)}" />`,
  );
  result = result.replace(
    /<meta\s+property="og:description"\s+content="[\s\S]*?"\s*\/?>/i,
    `<meta property="og:description" content="${escapeHtml(seo.description)}" />`,
  );
  if (seo.imageUrl) {
    result = result.replace(
      /<meta\s+property="og:image"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta property="og:image" content="${escapeHtml(seo.imageUrl)}" />`,
    );
  }
  if (seo.ogType) {
    result = result.replace(
      /<meta\s+property="og:type"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta property="og:type" content="${escapeHtml(seo.ogType)}" />`,
    );
  }

  // Extra meta tags to insert into <head>
  const extraHeadTags: string[] = [];

  // Canonical tag
  extraHeadTags.push(`<link rel="canonical" href="${escapeHtml(seo.canonicalUrl)}" />`);
  extraHeadTags.push(`<meta property="og:url" content="${escapeHtml(seo.canonicalUrl)}" />`);

  // Robots meta
  if (seo.noindex) {
    extraHeadTags.push('<meta name="robots" content="noindex, nofollow" />');
  } else {
    extraHeadTags.push('<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />');
  }

  // JSON-LD Structured Data
  if (seo.jsonLd) {
    extraHeadTags.push(
      `<script type="application/ld+json" id="seo-structured-data">${JSON.stringify(seo.jsonLd)}</script>`,
    );
  }

  // Remove existing canonical or robots tags if already present
  result = result.replace(/<link\s+rel="canonical"[\s\S]*?\/?>/gi, '');
  result = result.replace(/<meta\s+name="robots"[\s\S]*?\/?>/gi, '');
  result = result.replace(/<script\s+type="application\/ld\+json"\s+id="seo-structured-data"[\s\S]*?<\/script>/gi, '');

  const tagsBlock = '    ' + extraHeadTags.join('\n    ') + '\n';
  result = result.replace('</head>', `${tagsBlock}</head>`);

  return result;
}
