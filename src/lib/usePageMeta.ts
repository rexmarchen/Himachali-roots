import { useEffect } from 'react';

export interface PageMeta {
  title: string;
  description?: string;
  canonicalPath?: string;
  image?: string | null;
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
  noindex?: boolean;
}

function setMeta(attr: 'name' | 'property', key: string, content: string | null): () => void {
  const selector = `meta[${attr}="${key}"]`;
  const existing = document.head.querySelector<HTMLMetaElement>(selector);
  const previous = existing?.getAttribute('content') ?? null;
  if (content === null) {
    existing?.remove();
  } else if (existing) {
    existing.setAttribute('content', content);
  } else {
    const element = document.createElement('meta');
    element.setAttribute(attr, key);
    element.setAttribute('content', content);
    document.head.appendChild(element);
  }
  return () => {
    const current = document.head.querySelector<HTMLMetaElement>(selector);
    if (!current) return;
    if (previous === null) current.remove();
    else current.setAttribute('content', previous);
  };
}

function setCanonical(href: string | null): () => void {
  const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const previous = existing?.getAttribute('href') ?? null;
  if (href === null) {
    existing?.remove();
  } else if (existing) {
    existing.setAttribute('href', href);
  } else {
    const element = document.createElement('link');
    element.rel = 'canonical';
    element.href = href;
    document.head.appendChild(element);
  }
  return () => {
    const current = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!current) return;
    if (previous === null) current.remove();
    else current.setAttribute('href', previous);
  };
}

function setJsonLd(json: Record<string, unknown> | Array<Record<string, unknown>> | undefined): () => void {
  if (!json) return () => {};
  let script = document.head.querySelector<HTMLScriptElement>('#route-json-ld');
  const previous = script?.textContent ?? null;
  if (!script) {
    script = document.createElement('script');
    script.id = 'route-json-ld';
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(json);
  return () => {
    const current = document.head.querySelector<HTMLScriptElement>('#route-json-ld');
    if (!current) return;
    if (previous === null) current.remove();
    else current.textContent = previous;
  };
}

/**
 * Sets the document title and social/search metadata for a route and restores
 * the previous values when the route unmounts.
 */
export function usePageMeta({ title, description, canonicalPath, image, jsonLd, noindex }: PageMeta): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    const origin = window.location.hostname.includes('dearhills.in')
      ? 'https://www.dearhills.in'
      : window.location.origin;

    const canonical = canonicalPath ? `${origin}${canonicalPath}` : null;
    const imageUrl = image ? (image.startsWith('http') ? image : `${origin}${image}`) : null;

    const restores = [
      setMeta('name', 'description', description ?? null),
      setMeta('property', 'og:title', title),
      setMeta('property', 'og:description', description ?? null),
      setMeta('property', 'og:image', imageUrl),
      setMeta('property', 'og:url', canonical ?? origin),
      setMeta('name', 'twitter:card', 'summary_large_image'),
      setMeta('name', 'twitter:title', title),
      setMeta('name', 'twitter:description', description ?? null),
      setMeta('name', 'twitter:image', imageUrl),
      setMeta(
        'name',
        'robots',
        noindex
          ? 'noindex, nofollow'
          : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
      ),
      setCanonical(canonical),
      setJsonLd(jsonLd),
    ];

    return () => {
      document.title = previousTitle;
      for (const restore of restores) restore();
    };
  }, [title, description, canonicalPath, image, jsonLd, noindex]);
}
