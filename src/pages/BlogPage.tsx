import { useState, useMemo, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Paged, ProductSummary } from '@shared/types';
import { ALL_JOURNAL_POSTS, HIMALAYAN_GUIDES, findJournalPostBySlug, isGuidePost } from '@shared/guides';
import { BRAND_NAME, fitSeoDescription, fitSeoTitle } from '@shared/seo';
import { api } from '@/lib/api';
import { parseMarkdownBlocks } from '@/lib/blogMarkdown';
import { usePageMeta } from '@/lib/usePageMeta';
import { ProductGrid } from '@/components/ProductCard';
import { Breadcrumbs, LinkButton } from '@/components/ui';

/* ---------------- Share Icons ---------------- */
function WhatsAppIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.23 8.23 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.42 0-2.81-.37-4.04-1.07l-.29-.17-3.01.79.8-2.93-.19-.3a8.21 8.21 0 0 1-1.26-4.39c0-4.54 3.7-8.24 8.24-8.24m4.52 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.24-.75-.67-1.26-1.5-1.4-1.75-.15-.25-.02-.39.11-.51.11-.11.25-.29.38-.44.12-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.78 2.72 4.31 3.81.6.26 1.07.41 1.44.53.61.19 1.16.17 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.17-.48-.29" />
    </svg>
  );
}

function TwitterIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  'shawls-and-weaves': 'Shawls & Handlooms',
  'tea-and-infusions': 'Kangra Orthodox Tea',
  'fruits-and-fresh-produce': 'Fruits & Fresh Produce',
  'dry-fruit-and-nuts': 'Dry Fruit & Nuts',
  'pantry-and-preserves': 'Wild Honey & Preserves',
  'cold-pressed-oils': 'Cold-Pressed Oils',
  'pulses-and-staples': 'Mountain Pulses & Staples',
  knitwear: 'Warm Knitwear',
  'caps-and-headwear': 'Himachali Caps',
  'crafts-and-handicrafts': 'Handmade Crafts & Handicrafts',
  'traditional-goods-and-essentials': 'Traditional Himachali Products',
  gifting: 'Curated Gifting',
};

function renderInlineMarkdown(text: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      tokens.push(
        <strong key={`b-${keyIdx++}`} className="font-semibold text-forest">
          {renderInlineMarkdown(token.slice(2, -2))}
        </strong>,
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      tokens.push(<em key={`i-${keyIdx++}`}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        if (href.startsWith('/')) {
          tokens.push(
            <Link key={`l-${keyIdx++}`} to={href} className="font-medium text-terra underline underline-offset-2 hover:text-forest">
              {label}
            </Link>,
          );
        } else {
          tokens.push(
            <a
              key={`a-${keyIdx++}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-terra underline underline-offset-2 hover:text-forest"
            >
              {label}
            </a>,
          );
        }
      } else {
        tokens.push(token);
      }
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }
  return tokens;
}

/* ---------------- Blog & Guides Index Page ---------------- */
export function BlogIndexPage() {
  const location = useLocation();
  const isGuidesIndex = location.pathname.startsWith('/guides');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const dataset = isGuidesIndex ? HIMALAYAN_GUIDES : ALL_JOURNAL_POSTS;

  usePageMeta({
    title: fitSeoTitle(
      isGuidesIndex
        ? `Himalayan Craft & Buying Guides | ${BRAND_NAME}`
        : `Himalayan Journal & Guides | ${BRAND_NAME}`,
      60,
      BRAND_NAME,
    ),
    description: fitSeoDescription(
      'Original guides across Pashmina, Kullu & Kinnauri shawls, GI tags, Himalayan honey, Kangra & Darjeeling tea, Aipan, Chamba rumal & wool care.',
      158,
    ),
    canonicalPath: isGuidesIndex ? '/guides' : '/blog',
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Blog',
          name: `${BRAND_NAME} Mountain Journal & Guides`,
          url: `https://www.dearhills.in${isGuidesIndex ? '/guides' : '/blog'}`,
          description:
            'Deep guides, craft heritage notes, and sourcing checks across all Indian Himalayan regions.',
          publisher: {
            '@type': 'Organization',
            name: BRAND_NAME,
            logo: {
              '@type': 'ImageObject',
              url: 'https://www.dearhills.in/favicon-192x192.png',
              width: 192,
              height: 192,
            },
          },
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.dearhills.in' },
            {
              '@type': 'ListItem',
              position: 2,
              name: isGuidesIndex ? 'Himalayan Guides' : 'Mountain Journal',
              item: `https://www.dearhills.in${isGuidesIndex ? '/guides' : '/blog'}`,
            },
          ],
        },
      ],
    },
  });

  const categories = useMemo(() => {
    const set = new Set(dataset.map((p) => p.category));
    return ['All', ...Array.from(set)];
  }, [dataset]);

  const filteredPosts = useMemo(() => {
    return dataset.filter((post) => {
      const matchCat = selectedCategory === 'All' || post.category === selectedCategory;
      const matchQuery =
        !searchQuery ||
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchQuery;
    });
  }, [dataset, selectedCategory, searchQuery]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 sm:py-12">
      <div className="hidden sm:block">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Mountain Journal' }]} />
      </div>

      <header className="mt-4 pb-8 border-b border-line">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-terra">
          The Dear Hills Journal
        </span>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight text-forest">
          Stories, Craft Heritage &amp; Mountain Guides
        </h1>
        <p className="mt-3 max-w-2xl text-sm sm:text-base leading-relaxed text-ink/75 font-sans">
          Deep dives into authentic Himalayan handlooms, generational foraging, orthodox tea harvests,
          and how to choose genuine mountain goods with verified provenance.
        </p>

        {/* Categories & Search Filter */}
        <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                  selectedCategory === cat
                    ? 'bg-forest text-paper shadow-xs'
                    : 'bg-surface border border-line text-ink/70 hover:bg-paper hover:text-ink'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guides & stories…"
              className="w-full rounded-full border border-line bg-surface px-4 py-1.5 text-xs text-ink placeholder:text-muted focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest"
            />
          </div>
        </div>
      </header>

      {/* Articles Grid */}
      <div className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {filteredPosts.map((post) => {
          const postHref = `${isGuidePost(post) ? '/guides' : '/blog'}/${post.slug}`;
          return (
          <article
            key={post.id}
            className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-all duration-300 hover:shadow-md hover:border-sand/60"
          >
            <Link to={postHref} className="relative block aspect-[16/10] overflow-hidden bg-sand/10">
              <img
                src={post.coverImage}
                alt={post.coverAlt}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
              <span className="absolute top-3 left-3 rounded-md bg-forest/90 backdrop-blur-xs px-2.5 py-1 text-[10.5px] font-medium text-paper">
                {post.category}
              </span>
            </Link>

            <div className="flex flex-1 flex-col justify-between p-6">
              <div>
                <div className="flex items-center gap-2 text-[11px] text-muted font-sans">
                  <time dateTime={post.publishedAt}>{post.publishedAt}</time>
                  <span>·</span>
                  <span>{post.readTime}</span>
                </div>

                <h2 className="mt-2.5 font-serif text-xl sm:text-2xl font-medium leading-snug text-forest group-hover:text-terra transition-colors">
                  <Link to={postHref}>{post.title}</Link>
                </h2>

                <p className="mt-2.5 text-xs sm:text-sm leading-relaxed text-ink/75 line-clamp-3 font-sans">
                  {post.summary}
                </p>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-line/60 pt-4">
                <div className="flex items-center gap-2.5">
                  <img
                    src={post.author.avatar}
                    alt={post.author.name}
                    className="h-7 w-7 rounded-full object-cover border border-line"
                  />
                  <div className="text-[11px] font-sans">
                    <p className="font-medium text-forest">{post.author.name}</p>
                    <p className="text-muted text-[10px]">{post.author.role}</p>
                  </div>
                </div>

                <Link
                  to={postHref}
                  className="text-xs font-semibold text-terra hover:underline flex items-center gap-1"
                >
                  Read guide →
                </Link>
              </div>
            </div>
          </article>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Single Blog / Guide Post Page ---------------- */
export function BlogPostDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const isGuideRoute = location.pathname.startsWith('/guides/');
  const [copied, setCopied] = useState(false);

  const post = useMemo(() => {
    return slug ? findJournalPostBySlug(slug) : undefined;
  }, [slug]);

  const productsQuery = useQuery({
    queryKey: ['blog-related-products', slug],
    queryFn: async () => {
      const firstPage = await api<Paged<ProductSummary>>('/products?pageSize=48');
      if (!post || firstPage.total <= firstPage.items.length) return firstPage.items;
      const found = new Set(firstPage.items.map((item) => item.slug));
      const missing = post.relatedProductSlugs.filter((s) => !found.has(s));
      if (missing.length === 0) return firstPage.items;
      const extras = await Promise.allSettled(
        missing.map((s) => api<{ product: ProductSummary }>(`/products/${encodeURIComponent(s)}`)),
      );
      const extraItems = extras
        .filter((res): res is PromiseFulfilledResult<{ product: ProductSummary }> => res.status === 'fulfilled')
        .map((res) => res.value.product);
      return [...firstPage.items, ...extraItems];
    },
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(post && post.relatedProductSlugs.length > 0),
  });

  const relatedProducts = useMemo(() => {
    if (!post || !productsQuery.data) return [];
    const bySlug = new Map(productsQuery.data.map((item) => [item.slug, item]));
    return post.relatedProductSlugs
      .map((s) => bySlug.get(s))
      .filter((item): item is ProductSummary => Boolean(item));
  }, [post, productsQuery.data]);

  const markdownBlocks = useMemo(() => (post ? parseMarkdownBlocks(post.content) : []), [post]);

  const routePrefix = isGuideRoute ? '/guides' : '/blog';
  const currentUrl = `https://www.dearhills.in${routePrefix}/${slug ?? ''}`;

  const jsonLd = useMemo(() => {
    if (!post) return undefined;
    const coverUrl = post.coverImage.startsWith('http')
      ? post.coverImage
      : `https://www.dearhills.in${post.coverImage}`;
    const graph: Array<Record<string, unknown>> = [
      {
        '@type': 'BlogPosting',
        headline: post.title,
        description: fitSeoDescription(post.metaDescription, 158),
        image: [coverUrl],
        datePublished: post.publishedAt,
        dateModified: post.publishedAt,
        keywords: post.tags.join(', '),
        author: {
          '@type': 'Person',
          name: post.author.name,
          jobTitle: post.author.role,
        },
        publisher: {
          '@type': 'Organization',
          name: BRAND_NAME,
          logo: {
            '@type': 'ImageObject',
            url: 'https://www.dearhills.in/favicon-192x192.png',
            width: 192,
            height: 192,
          },
        },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': currentUrl,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.dearhills.in' },
          {
            '@type': 'ListItem',
            position: 2,
            name: isGuideRoute ? 'Himalayan Guides' : 'Mountain Journal',
            item: `https://www.dearhills.in${routePrefix}`,
          },
          { '@type': 'ListItem', position: 3, name: post.title, item: currentUrl },
        ],
      },
    ];

    if (post.faqs && post.faqs.length > 0) {
      graph.push({
        '@type': 'FAQPage',
        mainEntity: post.faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      });
    }

    return {
      '@context': 'https://schema.org',
      '@graph': graph,
    };
  }, [post, currentUrl, isGuideRoute, routePrefix]);

  usePageMeta({
    title: post ? fitSeoTitle(post.metaTitle, 60, BRAND_NAME) : `Story Not Found · ${BRAND_NAME}`,
    description: post
      ? fitSeoDescription(post.metaDescription, 158)
      : 'The requested Himalayan heritage guide could not be found.',
    canonicalPath: `${routePrefix}/${slug ?? ''}`,
    image: post?.coverImage,
    ogType: 'article',
    jsonLd,
    noindex: !post,
  });

  if (!post) {
    return <Navigate to={routePrefix} replace />;
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
    } catch {
      // Clipboard may be unavailable; still provide visual feedback
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const shareText = encodeURIComponent(`${post.title} — via Dear Hills`);
  const whatsappUrl = `https://api.whatsapp.com/send?text=${shareText}%20${encodeURIComponent(currentUrl)}`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(currentUrl)}`;

  return (
    <article className="mx-auto max-w-[56rem] px-4 py-8 sm:px-6 lg:px-8 sm:py-12">
      <div className="hidden sm:block">
        <Breadcrumbs
          items={[
            { label: 'Home', to: '/' },
            { label: 'Mountain Journal', to: '/blog' },
            { label: post.title },
          ]}
        />
      </div>

      <header className="mt-6 text-center max-w-3xl mx-auto">
        <span className="inline-block rounded-full bg-terra/10 px-3 py-1 text-xs font-medium text-terra tracking-wide">
          {post.category}
        </span>

        <h1 className="mt-4 font-serif text-3xl sm:text-4xl lg:text-5xl font-medium leading-tight text-forest tracking-tight">
          {post.title}
        </h1>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-muted font-sans">
          <div className="flex items-center gap-2">
            <img
              src={post.author.avatar}
              alt={post.author.name}
              className="h-8 w-8 rounded-full object-cover border border-line"
            />
            <span className="font-medium text-forest">{post.author.name}</span>
          </div>
          <span>·</span>
          <time dateTime={post.publishedAt}>{post.publishedAt}</time>
          <span>·</span>
          <span>{post.readTime}</span>
        </div>
      </header>

      {/* Featured Cover Image */}
      <div className="mt-8 overflow-hidden rounded-2xl border border-line shadow-sm aspect-[16/9] bg-sand/10">
        <img
          src={post.coverImage}
          alt={post.coverAlt}
          className="h-full w-full object-cover"
        />
      </div>

      {isGuidePost(post) && post.factCheckRequired ? (
        <div className="mt-6 max-w-3xl mx-auto rounded-xl border border-amber-300/70 bg-amber-50/70 px-4 py-3 text-xs leading-relaxed text-amber-950">
          <strong className="font-semibold">Editorial verification note:</strong>{' '}
          {post.verificationNote ?? 'Specific GI registry numbers, historic dates, and regional cooperative filings referenced in this educational guide should be checked against official producer and registry records.'}
        </div>
      ) : null}

      {/* Content Body */}
      <div className="mt-10 max-w-3xl mx-auto prose prose-emerald font-sans leading-relaxed text-ink/80 text-[15px] sm:text-base">
        {markdownBlocks.map((block, i) => {
          if (block.type === 'heading') {
            if (block.level === 2) {
              return (
                <h2
                  key={i}
                  className="mt-10 mb-4 font-serif text-2xl sm:text-3xl font-medium text-forest border-b border-line pb-2"
                >
                  {renderInlineMarkdown(block.text)}
                </h2>
              );
            }
            if (block.level === 3) {
              return (
                <h3 key={i} className="mt-6 mb-2 font-serif text-xl sm:text-2xl font-medium text-forest">
                  {renderInlineMarkdown(block.text)}
                </h3>
              );
            }
            return (
              <h4 key={i} className="mt-5 mb-2 font-serif text-lg font-medium text-forest">
                {renderInlineMarkdown(block.text)}
              </h4>
            );
          }

          if (block.type === 'hr') {
            return <hr key={i} className="my-8 border-line" />;
          }

          if (block.type === 'ul') {
            return (
              <ul key={i} className="my-4 list-disc pl-5 space-y-1.5 text-ink/85">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInlineMarkdown(item)}</li>
                ))}
              </ul>
            );
          }

          if (block.type === 'ol') {
            return (
              <ol key={i} className="my-4 list-decimal pl-5 space-y-3 text-ink/85">
                {block.items.map((item, j) => (
                  <li key={j}>
                    <div>{renderInlineMarkdown(item.text)}</div>
                    {item.extraParagraphs.map((extra, k) => (
                      <p key={k} className="mt-1.5 text-ink/80">
                        {renderInlineMarkdown(extra)}
                      </p>
                    ))}
                    {item.subItems.length > 0 ? (
                      <ul className="mt-2 list-disc pl-5 space-y-1 text-ink/80">
                        {item.subItems.map((sub, sIdx) => (
                          <li key={sIdx}>{renderInlineMarkdown(sub)}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
            );
          }

          if (block.type === 'table') {
            return (
              <div key={i} className="my-6 overflow-x-auto rounded-lg border border-line bg-surface p-2">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-line bg-paper">
                      {block.headers.map((h, k) => (
                        <th key={k} className="p-3 font-semibold text-forest">
                          {renderInlineMarkdown(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((cells, rIdx) => (
                      <tr key={rIdx} className="border-b border-line/60 last:border-none">
                        {cells.map((c, cIdx) => (
                          <td key={cIdx} className="p-3 text-ink/80">
                            {renderInlineMarkdown(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }

          return (
            <p key={i} className="my-4">
              {renderInlineMarkdown(block.text)}
            </p>
          );
        })}
      </div>

      {/* FAQs Section for Rich Snippets */}
      {post.faqs && post.faqs.length > 0 ? (
        <div className="mt-12 max-w-3xl mx-auto rounded-xl border border-line bg-surface p-6 sm:p-8">
          <h3 className="font-serif text-2xl font-medium text-forest">
            Frequently Asked Questions
          </h3>
          <div className="mt-6 space-y-4">
            {post.faqs.map((faq, idx) => (
              <div key={idx} className="border-b border-line/60 pb-4 last:border-none">
                <h4 className="font-medium text-forest text-sm sm:text-base">
                  {faq.question}
                </h4>
                <p className="mt-1.5 text-xs sm:text-sm text-ink/75 leading-relaxed font-sans">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Aligned Related Products Mentioned in This Guide */}
      {relatedProducts.length > 0 ? (
        <section className="mt-12 max-w-3xl mx-auto border-t border-line pt-10" aria-labelledby="blog-related-products">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-terra">
                Featured in This Guide
              </p>
              <h2 id="blog-related-products" className="mt-1 font-serif text-2xl text-forest">
                Shop Authentic Goods Mentioned Above
              </h2>
            </div>
            <Link to="/shop" className="text-xs font-semibold text-terra hover:underline">
              Explore full catalogue →
            </Link>
          </div>
          <ProductGrid products={relatedProducts} showAddToCart />
        </section>
      ) : null}

      {/* Explore Related Categories */}
      {post.relatedCategorySlugs && post.relatedCategorySlugs.length > 0 ? (
        <div className="mt-8 max-w-3xl mx-auto flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wider text-muted">Explore shelves:</span>
          {post.relatedCategorySlugs.map((catSlug) => (
            <Link
              key={catSlug}
              to={`/categories/${catSlug}`}
              className="rounded-full border border-line bg-surface px-3 py-1 font-medium text-forest transition-colors hover:border-terra hover:text-terra"
            >
              {CATEGORY_LABELS[catSlug] ?? catSlug}
            </Link>
          ))}
        </div>
      ) : null}

      {/* Share Section */}
      <div className="mt-12 max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 border-y border-line py-6">
        <div className="text-sm font-medium text-forest">
          Share this Himalayan story with friends:
        </div>

        <div className="flex items-center gap-3">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full bg-[#25D366]/10 px-3.5 py-1.5 text-xs font-semibold text-[#128C7E] hover:bg-[#25D366]/20 transition-colors"
          >
            <WhatsAppIcon className="h-4 w-4" />
            WhatsApp
          </a>

          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full bg-forest/10 px-3.5 py-1.5 text-xs font-semibold text-forest hover:bg-forest/20 transition-colors"
          >
            <TwitterIcon className="h-4 w-4" />
            Share on X
          </a>

          <button
            onClick={handleCopyLink}
            className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-medium text-ink hover:bg-paper transition-colors"
          >
            {copied ? '✓ Copied link!' : 'Copy link'}
          </button>
        </div>
      </div>

      {/* Shop Featured Authentic Products Card */}
      <div className="mt-14 max-w-3xl mx-auto overflow-hidden rounded-2xl border border-sand/40 bg-gradient-to-br from-[#FAF6F0] via-surface to-[#F3EDE2] p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-terra">
              Verified Mountain Provenance
            </span>
            <h3 className="mt-1 font-serif text-2xl font-medium text-forest">
              Shop Authentic Himachali Goods
            </h3>
            <p className="mt-2 text-xs sm:text-sm text-ink/75 max-w-lg leading-relaxed font-sans">
              Support traditional pit loom weavers, orchardists, and forest beekeepers directly. 88% of your order value goes to local mountain creators.
            </p>
          </div>

          <LinkButton to="/shop" variant="primary" className="shrink-0">
            Browse Catalogue →
          </LinkButton>
        </div>
      </div>
    </article>
  );
}
