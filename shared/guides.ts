import { BLOG_POSTS, type BlogPost } from './blog.js';
import { GUIDES_PART_1, type GuidePost } from './guidesData1.js';
import { GUIDES_PART_2 } from './guidesData2.js';

export type { GuidePost };

export const HIMALAYAN_GUIDES: GuidePost[] = [...GUIDES_PART_1, ...GUIDES_PART_2];

export const ALL_JOURNAL_POSTS: (BlogPost | GuidePost)[] = [
  ...BLOG_POSTS,
  ...HIMALAYAN_GUIDES,
];

export function findJournalPostBySlug(slug: string): (BlogPost | GuidePost) | undefined {
  return ALL_JOURNAL_POSTS.find((entry) => entry.slug === slug);
}

export function isGuidePost(entry: BlogPost | GuidePost): entry is GuidePost {
  return 'factCheckRequired' in entry || 'regionSlug' in entry || 'craftSlug' in entry || entry.id.startsWith('guide_');
}
