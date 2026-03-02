import Parser from "rss-parser";
import type { RssDatabase } from "./db.js";
import type { RefreshFeedResult, RefreshResult, Subscription } from "./types.js";

const parser = new Parser({ timeout: 20_000 });

function normalizeDate(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    if (!value) continue;
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

export async function refreshFeeds(
  db: RssDatabase,
  subscriptions: Subscription[],
): Promise<RefreshResult> {
  const perFeed: RefreshFeedResult[] = [];

  for (const sub of subscriptions) {
    try {
      const feed = await parser.parseURL(sub.url);
      let newEntries = 0;
      let updatedEntries = 0;

      for (const item of feed.items ?? []) {
        const link = item.link?.trim();
        if (!link) continue;

        const upsert = db.upsertEntry(sub.id, {
          guid: item.guid ?? item.id ?? null,
          link,
          title: item.title ?? null,
          author: item.creator ?? item.author ?? null,
          publishedAt: normalizeDate(item.isoDate, item.pubDate),
          summary: item.contentSnippet ?? item.summary ?? null,
          content: item["content:encoded"] ?? item.content ?? null,
          rawJson: JSON.stringify(item),
        });

        if (upsert.inserted) newEntries += 1;
        if (upsert.updated) updatedEntries += 1;
      }

      db.updateSubscriptionFetchedMeta(sub.id);
      perFeed.push({
        subscriptionId: sub.id,
        url: sub.url,
        fetched: true,
        newEntries,
        updatedEntries,
      });
    } catch (error) {
      perFeed.push({
        subscriptionId: sub.id,
        url: sub.url,
        fetched: false,
        newEntries: 0,
        updatedEntries: 0,
        error: error instanceof Error ? error.message : "Unknown fetch failure",
      });
    }
  }

  return {
    totals: {
      feeds: perFeed.length,
      fetched: perFeed.filter((x) => x.fetched).length,
      failed: perFeed.filter((x) => !x.fetched).length,
      newEntries: perFeed.reduce((sum, x) => sum + x.newEntries, 0),
      updatedEntries: perFeed.reduce((sum, x) => sum + x.updatedEntries, 0),
    },
    perFeed,
  };
}
