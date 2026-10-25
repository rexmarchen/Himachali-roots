export interface PolicySection {
  heading: string;
  body: string;
}

export interface PolicyDocument {
  title: string;
  status: 'draft' | 'published';
  lastUpdated: string;
  summary: string;
  sections: PolicySection[];
}

export interface HomepageContent {
  hero: {
    eyebrow: string;
    title: string;
    body: string;
    image: string;
    imageAlt: string;
    imageCredit: string;
    ctaLabel: string;
    ctaHref: string;
  };
  editorial: {
    title: string;
    body: string;
    signature: string;
    image: string;
    imageAlt: string;
    imageCredit: string;
  };
  gifting: {
    title: string;
    body: string;
    categorySlug: string;
  };
  makerIntro: string;
}

export interface Announcement {
  active: boolean;
  text: string;
  href?: string;
}

export interface AboutContent {
  title: string;
  intro: string;
  sections: PolicySection[];
}

export interface FaqContent {
  title: string;
  intro: string;
  items: { question: string; answer: string }[];
}

export interface CreditsContent {
  intro: string;
  items: { title: string; author: string; license: string; sourceUrl: string; usedFor: string }[];
}

export interface SiteContent {
  announcement: Announcement;
  homepage: HomepageContent;
  about: AboutContent;
  sourcing: AboutContent;
  faq: FaqContent;
  credits: CreditsContent;
  policies: Record<string, PolicyDocument>;
}

export const POLICY_KEYS = [
  'shipping',
  'returns',
  'privacy',
  'terms',
  'seller-terms',
  'authenticity',
  'cookies',
] as const;

export type PolicyKey = (typeof POLICY_KEYS)[number];
