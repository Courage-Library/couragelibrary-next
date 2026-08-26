export interface SeoMetadataProps {
  title?: string;
  description?: string;
  keywords?: string[];
  canonicalUrl?: string;
  ogImage?: string;
  ogType?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  noIndex?: boolean;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface JsonLdArticleProps {
  headline: string;
  description: string;
  url: string;
  image?: string;
  datePublished?: string;
  dateModified?: string;
  authorName?: string;
}

export interface JsonLdFaqProps {
  questions: Array<{
    question: string;
    answer: string;
  }>;
}
