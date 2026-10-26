import { useEffect } from 'react';

interface PageMeta {
  title: string;
  description?: string;
  canonicalPath?: string;
  image?: string | null;
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

/**
 * Sets the document title and social/search metadata for a route and restores
 * the previous values when the route unmounts. Kept deliberately small: this
 * app is client-rendered and has no per-route metadata layer yet.
 */
export function usePageMeta({ title, description, canonicalPath, image }: PageMeta): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    const canonical = canonicalPath ? `${window.location.origin}${canonicalPath}` : null;
    const imageUrl = image ? (image.startsWith('http') ? image : `${window.location.origin}${image}`) : null;

    const restores = [
      setMeta('name', 'description', description ?? null),
      setMeta('property', 'og:title', title),
      setMeta('property', 'og:description', description ?? null),
      setMeta('property', 'og:image', imageUrl),
      setMeta('name', 'twitter:card', 'summary_large_image'),
      setMeta('name', 'twitter:title', title),
      setMeta('name', 'twitter:description', description ?? null),
      setCanonical(canonical),
    ];

    return () => {
      document.title = previousTitle;
      for (const restore of restores) restore();
    };
  }, [title, description, canonicalPath, image]);
}
