import { useEffect } from 'react';

export interface PageMeta {
  title: string;
  description?: string;
  canonicalPath?: string;
  image?: string | null;
  ogType?: 'website' | 'product' | 'article' | 'profile';
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
  noindex?: boolean;
  enabled?: boolean;
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

function setJsonLd(
  json: Record<string, unknown> | Array<Record<string, unknown>> | undefined,
  noindex?: boolean,
): () => void {
  void noindex;
  document.head.querySelector<HTMLScriptElement>('#route-json-ld')?.remove();

  if (!json) {
    const existing = document.head.querySelector<HTMLScriptElement>('#seo-structured-data');
    const previous = existing?.textContent ?? null;
    existing?.remove();
    return () => {
      if (previous !== null && !document.head.querySelector('#seo-structured-data')) {
        const restored = document.createElement('script');
        restored.id = 'seo-structured-data';
        restored.type = 'application/ld+json';
        restored.textContent = previous;
        document.head.appendChild(restored);
      }
    };
  }

  let script = document.head.querySelector<HTMLScriptElement>('#seo-structured-data');
  const previous = script?.textContent ?? null;
  const created = !script;
  if (!script) {
    script = document.createElement('script');
    script.id = 'seo-structured-data';
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  const serialized = JSON.stringify(json);
  if (script.textContent !== serialized) {
    script.textContent = serialized;
  }

  return () => {
    const current = document.head.querySelector<HTMLScriptElement>('#seo-structured-data');
    if (!current) return;
    if (created || previous === null) current.remove();
    else if (current.textContent !== previous) current.textContent = previous;
  };
}

/**
 * Sets the document title and social/search metadata for a route and restores
 * the previous values when the route unmounts.
 */
export function usePageMeta({
  title,
  description,
  canonicalPath,
  image,
  ogType,
  jsonLd,
  noindex,
  enabled = true,
}: PageMeta): void {
  const serializedJsonLd = jsonLd ? JSON.stringify(jsonLd) : '';

  useEffect(() => {
    if (!enabled) return;
    const previousTitle = document.title;
    document.title = title;

    const origin = window.location.hostname.includes('dearhills.in')
      ? 'https://www.dearhills.in'
      : window.location.origin;

    const canonical = canonicalPath ? `${origin}${canonicalPath}` : null;
    const fallbackImage = `${origin}/images/home/kalpa-dawn-1100.jpg`;
    const imageUrl = image
      ? image.startsWith('http')
        ? image
        : `${origin}${image.startsWith('/') ? '' : '/'}${image}`
      : fallbackImage;

    const restores = [
      setMeta('name', 'description', description ?? null),
      setMeta('property', 'og:title', title),
      setMeta('property', 'og:description', description ?? null),
      setMeta('property', 'og:image', imageUrl),
      setMeta('property', 'og:url', canonical ?? origin),
      setMeta('property', 'og:type', ogType ?? 'website'),
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
      setJsonLd(jsonLd, noindex),
    ];

    return () => {
      document.title = previousTitle;
      for (const restore of restores) restore();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, canonicalPath, image, ogType, serializedJsonLd, noindex, enabled]);
}
