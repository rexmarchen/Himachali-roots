import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ProductSummary } from '@shared/types';
import type { PolicyDocument } from '@shared/content';
import { api, errorFields, errorMessage } from '@/lib/api';
import { useAuth, useSiteContent } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { formatDate } from '@/lib/format';
import { ProductGrid } from '@/components/ProductCard';
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  DemoBadge,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LinkButton,
  LoadingBlock,
  PageHeader,
  Textarea,
} from '@/components/ui';

interface PublicSeller {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  story: string | null;
  region: string | null;
  productCount: number;
  imageUrl: string | null;
}

export function MakersPage() {
  const sellers = useQuery({
    queryKey: ['sellers'],
    queryFn: () => api<{ sellers: PublicSeller[] }>('/sellers'),
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Makers' }]} />
      <PageHeader
        eyebrow="People, not labels"
        title="The makers behind the shelves"
        lede="Every storefront is reviewed before it appears. In this development build, seller names carry a (demo) marker and photographs are illustrative rather than portraits of the seeded businesses."
      />
      <div className="mt-10">
        {sellers.isLoading ? <LoadingBlock rows={4} /> : null}
        {sellers.isError ? <ErrorState onRetry={() => void sellers.refetch()} /> : null}
        {sellers.data && sellers.data.sellers.length === 0 ? (
          <EmptyState
            title="No makers are published yet"
            body="Seller storefronts appear after an administrator approves a completed application."
            action={<LinkButton to="/sell" size="sm">Apply to sell</LinkButton>}
          />
        ) : null}
        <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {sellers.data?.sellers.map((seller) => (
            <article key={seller.id}>
              <Link to={`/makers/${seller.slug}`} className="group block">
                <div className="aspect-[4/3] overflow-hidden bg-sand/40">
                  {seller.imageUrl ? (
                    <img
                      src={seller.imageUrl}
                      alt={`Illustrative product photograph from ${seller.name}`}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted">No photograph yet</div>
                  )}
                </div>
                <div className="mt-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-serif text-2xl text-forest group-hover:text-terra">{seller.name}</h2>
                      {seller.name.toLowerCase().includes('(demo)') ? <DemoBadge /> : null}
                    </div>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.13em] text-muted">
                      {seller.region ?? 'Himachal Pradesh'} · {seller.productCount} listing
                      {seller.productCount === 1 ? '' : 's'}
                    </p>
                    {seller.tagline ? (
                      <p className="mt-3 text-sm leading-relaxed text-ink/70">{seller.tagline}</p>
                    ) : null}
                  </div>
                  <span className="mt-1 text-terra" aria-hidden>↗</span>
                </div>
              </Link>
            </article>
          ))}
        </div>
      </div>
      <div className="mt-16 border border-forest/20 bg-forest px-6 py-10 text-paper sm:px-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-paper/50">For makers and growers</p>
            <h2 className="mt-3 text-3xl text-paper">There should be a shelf for what you make.</h2>
            <p className="mt-2 max-w-xl text-sm text-paper/65">
              Applications are reviewed manually. No listing fee is charged by this demonstration build.
            </p>
          </div>
          <LinkButton to="/sell" variant="terra">Apply to sell</LinkButton>
        </div>
      </div>
    </div>
  );
}

export function MakerDetailPage() {
  const { slug = '' } = useParams();
  const detail = useQuery({
    queryKey: ['maker', slug],
    queryFn: () => api<{ seller: PublicSeller & { village: string | null; approvedAt: string | null }; products: { items: ProductSummary[] } }>(`/sellers/${encodeURIComponent(slug)}`),
    enabled: Boolean(slug),
  });

  if (detail.isLoading) {
    return <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"><LoadingBlock rows={3} /></div>;
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <ErrorState
          title="This maker is not available"
          body="The storefront may not exist or may no longer be approved. Try the full list of makers."
          onRetry={() => void detail.refetch()}
        />
        <div className="mt-6 text-center"><LinkButton to="/makers" variant="secondary">All makers</LinkButton></div>
      </div>
    );
  }

  const { seller, products } = detail.data;
  return (
    <div>
      <div className="border-b border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Makers', to: '/makers' }, { label: seller.name }]} />
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="eyebrow">{seller.region ?? 'Himachal Pradesh'}{seller.village ? ` · ${seller.village}` : ''}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <h1 className="text-4xl leading-tight sm:text-5xl">{seller.name}</h1>
                {seller.name.toLowerCase().includes('(demo)') ? <DemoBadge /> : null}
              </div>
              {seller.tagline ? <p className="mt-4 max-w-2xl font-serif text-xl leading-relaxed text-forest/80">{seller.tagline}</p> : null}
              <p className="mt-5 max-w-2xl text-[15px] leading-[1.85] text-ink/75">
                {seller.story ??
                  'This maker has not added a store story yet. The seller name and region shown here come from the reviewed seller record.'}
              </p>
              <div className="mt-6 flex flex-wrap gap-3 text-[11px] text-muted">
                <Badge tone="sand">{seller.productCount} published listing{seller.productCount === 1 ? '' : 's'}</Badge>
                {seller.approvedAt ? <Badge tone="forest">Approved {formatDate(seller.approvedAt)}</Badge> : null}
              </div>
            </div>
            <figure>
              <div className="aspect-[4/3] overflow-hidden bg-sand/40">
                {seller.imageUrl ? (
                  <img src={seller.imageUrl} alt={`Illustrative work from ${seller.name}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted">No photograph yet</div>
                )}
              </div>
              <figcaption className="mt-2 text-[10.5px] leading-relaxed text-muted">
                Illustrative photograph from the development image set. It is not a portrait of this seller.
              </figcaption>
            </figure>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">From this workshop</p>
            <h2 className="mt-2 text-3xl">Current listings</h2>
          </div>
          <Link to={`/shop?seller=${encodeURIComponent(seller.slug)}`} className="link-underline text-xs text-muted">
            Filter in the shop
          </Link>
        </div>
        {products.items.length ? (
          <ProductGrid products={products.items} />
        ) : (
          <EmptyState title="No live listings" body="This maker does not have an approved listing at the moment." />
        )}
      </div>
    </div>
  );
}

export function AboutPage() {
  const content = useSiteContent();
  const about = content.data?.content.about;
  return (
    <div>
      <div className="border-b border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'About' }]} />
          <div className="grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <div>
              <p className="eyebrow">About PAHADI ROOTS</p>
              <h1 className="mt-3 max-w-3xl text-4xl leading-[1.05] sm:text-6xl">{about?.title ?? 'A marketplace with mud on its boots'}</h1>
              <p className="mt-6 max-w-2xl text-[15px] leading-[1.85] text-ink/75">{about?.intro}</p>
            </div>
            <figure>
              <div className="aspect-[4/3] overflow-hidden bg-sand/40">
                <img src="/images/editorial-terrace.jpg" alt="Terraced fields in Himachal Pradesh" className="h-full w-full object-cover" />
              </div>
              <figcaption className="mt-2 text-[10px] text-muted">Illustrative photograph via Wikimedia Commons — see image credits.</figcaption>
            </figure>
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[0.35fr_0.65fr] lg:px-8">
        <aside className="border-t border-line pt-5">
          <p className="eyebrow">In this document</p>
          <ul className="mt-4 space-y-2 text-sm text-muted">
            {(about?.sections ?? []).map((section, index) => (
              <li key={section.heading}>{String(index + 1).padStart(2, '0')} · {section.heading}</li>
            ))}
          </ul>
          <div className="mt-8 border border-terra/25 bg-[#fff8f4] p-4 text-[11.5px] leading-relaxed text-[#7d3d28]">
            This is a development build. Legal entity details, registrations and policy documents are placeholders pending
            completion and professional review.
          </div>
        </aside>
        <article className="prose-editorial max-w-3xl">
          {(about?.sections ?? []).map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              <p>{section.body}</p>
            </section>
          ))}
          <h2>How to reach a person</h2>
          <p>
            Questions about a seller, a claim or an order go to the support queue. Use the{' '}
            <Link to="/contact">contact form</Link> and include your order number where relevant.
          </p>
        </article>
      </div>
    </div>
  );
}

export function SourcingPage() {
  const content = useSiteContent();
  const sourcing = content.data?.content.sourcing;
  return (
    <div>
      <div className="border-b border-line">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'How we source' }]} />
          <p className="eyebrow">The standard</p>
          <h1 className="mt-3 max-w-4xl text-4xl leading-[1.04] sm:text-6xl">{sourcing?.title ?? 'How we choose what we sell'}</h1>
          <p className="mt-6 max-w-2xl text-[15px] leading-[1.85] text-ink/75">{sourcing?.intro}</p>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-9">
            {(sourcing?.sections ?? []).map((section, index) => (
              <section key={section.heading} className="border-t border-line pt-6">
                <p className="text-[10px] tabular-nums tracking-[0.16em] text-terra">{String(index + 1).padStart(2, '0')}</p>
                <h2 className="mt-2 text-2xl">{section.heading}</h2>
                <p className="mt-3 max-w-2xl text-[14.5px] leading-[1.8] text-ink/70">{section.body}</p>
              </section>
            ))}
          </div>
          <aside className="space-y-6">
            <figure>
              <div className="aspect-[4/5] overflow-hidden bg-sand/40">
                <img src="/images/weaving.jpg" alt="Hands at a wooden handloom" className="h-full w-full object-cover" loading="lazy" />
              </div>
              <figcaption className="mt-2 text-[10px] text-muted">Illustrative photograph via Wikimedia Commons — see image credits.</figcaption>
            </figure>
            <div className="border border-line bg-surface p-5">
              <h2 className="text-lg">What the badges mean</h2>
              <dl className="mt-4 space-y-4 text-[12.5px] leading-relaxed text-muted">
                <div>
                  <dt className="font-medium text-ink">Origin verified</dt>
                  <dd>Shown only where our team has recorded supporting documentation for the stated place of origin.</dd>
                </div>
                <div>
                  <dt className="font-medium text-ink">Verified purchase</dt>
                  <dd>A review attached to a delivered order item. We do not seed reviews or display testimonials from people who did not buy.</dd>
                </div>
                <div>
                  <dt className="font-medium text-ink">Demo data</dt>
                  <dd>Seeded development records. They are not real businesses, real stock, or evidence of real sales.</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function FaqPage() {
  const content = useSiteContent();
  const faq = content.data?.content.faq;
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-16">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'FAQ' }]} />
      <PageHeader
        eyebrow="Help"
        title={faq?.title ?? 'Questions, answered plainly'}
        lede={faq?.intro ?? 'If something is missing, write to us and a person will read it.'}
      />
      <div className="mt-8 divide-y divide-line border-y border-line">
        {(faq?.items ?? []).map((item, index) => {
          const expanded = open === index;
          return (
            <div key={item.question}>
              <button
                type="button"
                className="flex w-full items-start justify-between gap-5 py-5 text-left"
                onClick={() => setOpen(expanded ? null : index)}
                aria-expanded={expanded}
              >
                <span className="font-serif text-lg text-forest">{item.question}</span>
                <span className="mt-1 text-muted" aria-hidden>{expanded ? '−' : '+'}</span>
              </button>
              {expanded ? <p className="max-w-3xl pb-5 pr-8 text-sm leading-[1.8] text-ink/70">{item.answer}</p> : null}
            </div>
          );
        })}
      </div>
      <div className="mt-10 flex flex-col gap-4 border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl">Still unsure about something?</h2>
          <p className="mt-1 text-sm text-muted">Include an order number if your question is about a purchase.</p>
        </div>
        <LinkButton to="/contact" variant="secondary">Contact us</LinkButton>
      </div>
    </div>
  );
}

export function ContactPage() {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '', orderNumber: '', website: '' });
  const [submitting, setSubmitting] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [reference, setReference] = useState<string | null>(null);
  const { config } = useAuth();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setFields({});
    try {
      const result = await api<{ reference: string; message: string }>('/contact', { method: 'POST', body: form });
      setReference(result.reference);
      setForm({ name: '', email: '', subject: '', message: '', orderNumber: '', website: '' });
      toast.push('Your message has been recorded.');
    } catch (error) {
      setFields(errorFields(error));
      toast.push(errorMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-16">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Contact' }]} />
      <PageHeader
        eyebrow="Contact"
        title="Write to a person"
        lede="Order questions, seller concerns, image credits or corrections. The support queue is reviewed by the marketplace team."
      />
      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_0.7fr]">
        {reference ? (
          <div>
            <Alert tone="success" title="Message recorded">
              <p>
                Your reference is <strong>{reference}</strong>. Email delivery may not be configured on this deployment,
                but the message is stored in the support queue.
              </p>
            </Alert>
            <Button className="mt-5" variant="secondary" onClick={() => setReference(null)}>Send another message</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name" required error={fields.name}>
                <Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" />
              </Field>
              <Field label="Email address" required error={fields.email}>
                <Input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Subject" required error={fields.subject}>
                <Input required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} />
              </Field>
              <Field label="Order number" hint="Optional">
                <Input value={form.orderNumber} onChange={(event) => setForm({ ...form, orderNumber: event.target.value })} placeholder="PR-XXXXXX" />
              </Field>
            </div>
            <Field label="Message" required hint="At least 20 characters" error={fields.message}>
              <Textarea required minLength={20} rows={7} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} />
            </Field>
            <input
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              className="hidden"
              value={form.website}
              onChange={(event) => setForm({ ...form, website: event.target.value })}
            />
            <div className="flex flex-wrap items-center gap-4">
              <Button type="submit" loading={submitting}>Send message</Button>
              <span className="text-[11px] text-muted">We will not publish your message or email address.</span>
            </div>
          </form>
        )}
        <aside className="space-y-5">
          <div className="border border-line bg-surface p-5">
            <p className="eyebrow">Support email</p>
            <p className="mt-2 break-all text-sm text-forest">{config?.supportEmail ?? 'Loading…'}</p>
            {config?.supportEmailIsPlaceholder ? (
              <p className="mt-2 text-[11px] leading-relaxed text-terra">
                This is a placeholder address in the development configuration. Replace SUPPORT_EMAIL before launch.
              </p>
            ) : null}
          </div>
          <div className="border border-line bg-surface p-5">
            <p className="eyebrow">Before you write</p>
            <ul className="mt-3 space-y-3 text-[12.5px] leading-relaxed text-muted">
              <li>Order delays: include the order number and the seller shipment reference.</li>
              <li>Returns: start the request from the order page so the item and seller are recorded.</li>
              <li>Seller applications: use the seller dashboard for status and document requests.</li>
              <li>Privacy: request access or deletion from account settings; retention obligations may delay erasure.</li>
            </ul>
          </div>
          <div className="border border-line bg-[#efe7d9] p-5 text-[12px] leading-relaxed text-ink/70">
            <strong className="text-forest">No live chat claim.</strong> This build does not run a chat widget or promise
            instant replies. Messages are stored for manual review.
          </div>
        </aside>
      </div>
    </div>
  );
}

export function CreditsPage() {
  const content = useSiteContent();
  const credits = content.data?.content.credits;
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-16">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Image credits' }]} />
      <PageHeader eyebrow="Attribution" title="Image credits" lede={credits?.intro ?? 'Loading attribution…'} />
      <div className="mt-8 divide-y divide-line border-y border-line">
        {(credits?.items ?? []).map((item) => (
          <div key={`${item.title}-${item.sourceUrl}`} className="grid gap-2 py-4 sm:grid-cols-[1fr_1fr]">
            <div>
              <p className="font-serif text-lg text-forest">{item.title}</p>
              <p className="text-xs text-muted">{item.author}</p>
            </div>
            <div className="text-[12px] leading-relaxed text-muted">
              <p>{item.license} · used for {item.usedFor}</p>
              <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-forest underline underline-offset-2">
                Source page
              </a>
            </div>
          </div>
        ))}
        {credits && credits.items.length === 0 ? (
          <p className="py-6 text-sm text-muted">
            Attribution data is not loaded. Run the image fetch script and reseed the site content.
          </p>
        ) : null}
      </div>
      <div className="mt-8 border border-terra/25 bg-[#fff8f4] p-5 text-[12px] leading-relaxed text-[#7d3d28]">
        Photographs are development assets, not original product photography. Replace them with photographs of the actual
        products and makers before launch, and keep signed model or property releases where required.
      </div>
    </div>
  );
}

export function PolicyPage() {
  const { key = '' } = useParams();
  const policy = useQuery({
    queryKey: ['policy', key],
    queryFn: () => api<{ policy: PolicyDocument }>(`/policies/${encodeURIComponent(key)}`),
    enabled: Boolean(key),
  });

  if (policy.isLoading) return <div className="mx-auto max-w-4xl px-4 py-20"><LoadingBlock rows={4} /></div>;
  if (policy.isError || !policy.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <ErrorState title="That policy is not available" body="The document may have been renamed or is not published." onRetry={() => void policy.refetch()} />
        <div className="mt-6 text-center"><LinkButton to="/" variant="secondary">Back home</LinkButton></div>
      </div>
    );
  }

  const document = policy.data.policy;
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-16">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: document.title }]} />
      <PageHeader
        eyebrow="Policy"
        title={document.title}
        lede={document.summary}
        actions={<Badge tone={document.status === 'published' ? 'forest' : 'terra'}>{document.status === 'published' ? 'Published' : 'Draft — not legally reviewed'}</Badge>}
      />
      <p className="mt-3 text-[11px] text-muted">Last updated: {document.lastUpdated}</p>
      {document.status === 'draft' ? (
        <div className="mt-6">
          <Alert tone="warning" title="Draft document">
            This policy is a draft prepared for a development build. It must be reviewed by a qualified Indian lawyer and
            completed with the legal entity's details before it is relied on.
          </Alert>
        </div>
      ) : null}
      <article className="prose-editorial mt-10">
        {document.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.body.split('\n').map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
          </section>
        ))}
      </article>
      <div className="mt-12 flex flex-wrap gap-4 border-t border-line pt-6 text-xs">
        <Link to="/policies/shipping" className="link-underline text-muted">Shipping</Link>
        <Link to="/policies/returns" className="link-underline text-muted">Returns</Link>
        <Link to="/policies/privacy" className="link-underline text-muted">Privacy</Link>
        <Link to="/policies/terms" className="link-underline text-muted">Terms</Link>
        <Link to="/policies/seller-terms" className="link-underline text-muted">Seller terms</Link>
        <Link to="/contact" className="link-underline text-muted">Contact</Link>
      </div>
    </div>
  );
}

export { BecomeAMakerPage as SellPage } from './BecomeAMakerPage';

export function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-4 py-20 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 text-5xl">This path does not exist</h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
        The page may have moved, or the link may be incomplete. Nothing has been charged or changed by visiting this
        address.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <LinkButton to="/">Back home</LinkButton>
        <LinkButton to="/shop" variant="secondary">Browse the shop</LinkButton>
      </div>
    </div>
  );
}
