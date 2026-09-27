import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export type FetchedArticle = {
  url: string;
  title: string;
  byline: string | null;
  siteName: string | null;
  excerpt: string | null;
  textContent: string;
  publishedTime: string | null;
  contentSourceKey: "decoding-discontinuity" | "orchestration-economics" | "other";
};

const USER_AGENT =
  "Mozilla/5.0 (compatible; OrchestrationEconomicsBot/1.0; +https://twitter-orchestration-economics.vercel.app)";

function classifyByDomain(url: string): FetchedArticle["contentSourceKey"] {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("decodingdiscontinuity.com")) return "decoding-discontinuity";
    if (host.includes("orchestration-economics.com")) return "orchestration-economics";
    return "other";
  } catch {
    return "other";
  }
}

/**
 * Fetch a URL and extract the article body using Mozilla's Readability
 * (the same algorithm powering Firefox's Reader View). Works well on
 * Substack, WordPress-style blogs, and most long-form article pages.
 */
export async function fetchArticle(rawUrl: string): Promise<FetchedArticle> {
  const url = new URL(rawUrl.trim()).toString();

  const res = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText} for ${url}`);
  }
  const html = await res.text();

  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();

  if (!article || !article.textContent || article.textContent.trim().length < 100) {
    // Fallback: strip tags naively.
    const bodyText = dom.window.document.body?.textContent?.trim() ?? "";
    if (bodyText.length < 100) {
      throw new Error(
        `Could not extract article content from ${url} — page may require JavaScript or auth.`,
      );
    }
    return {
      url,
      title: dom.window.document.title || url,
      byline: null,
      siteName: null,
      excerpt: null,
      textContent: bodyText.slice(0, 20_000),
      publishedTime: null,
      contentSourceKey: classifyByDomain(url),
    };
  }

  return {
    url,
    title: (article.title || dom.window.document.title || url).trim(),
    byline: article.byline?.trim() ?? null,
    siteName: article.siteName?.trim() ?? null,
    excerpt: article.excerpt?.trim() ?? null,
    // Cap to keep prompt bounded — most articles fit under 15KB of plain text.
    textContent: article.textContent.trim().slice(0, 20_000),
    publishedTime: article.publishedTime ?? null,
    contentSourceKey: classifyByDomain(url),
  };
}
