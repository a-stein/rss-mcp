import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";
import type { ImportResult } from "./types.js";
import type { RssDatabase } from "./db.js";

interface OpmlOutline {
  "@_xmlUrl"?: string;
  "@_title"?: string;
  "@_text"?: string;
  outline?: OpmlOutline | OpmlOutline[];
}

interface OpmlDocument {
  opml?: {
    body?: {
      outline?: OpmlOutline | OpmlOutline[];
    };
  };
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function flattenOutlines(input: OpmlOutline | OpmlOutline[] | undefined): OpmlOutline[] {
  const queue = toArray(input);
  const out: OpmlOutline[] = [];

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    out.push(current);
    queue.push(...toArray(current.outline));
  }

  return out;
}

export function extractFeedsFromOpml(xml: string): Array<{ url: string; title: string | null }> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    trimValues: true,
  });

  const parsed = parser.parse(xml) as OpmlDocument;
  const outlines = flattenOutlines(parsed.opml?.body?.outline);

  const feeds: Array<{ url: string; title: string | null }> = [];
  for (const outline of outlines) {
    const url = outline["@_xmlUrl"]?.trim();
    if (!url) continue;

    feeds.push({
      url,
      title: outline["@_title"]?.trim() || outline["@_text"]?.trim() || null,
    });
  }

  return feeds;
}

export function importOpmlFile(db: RssDatabase, filePath: string): ImportResult {
  const xml = fs.readFileSync(filePath, "utf8");
  const feeds = extractFeedsFromOpml(xml);

  const seen = new Set<string>();
  const result: ImportResult = {
    imported: 0,
    updated: 0,
    skipped: 0,
    invalid: 0,
    errors: [],
  };

  for (const feed of feeds) {
    if (!feed.url.startsWith("http://") && !feed.url.startsWith("https://")) {
      result.invalid += 1;
      result.errors.push({ url: feed.url, message: "Unsupported URL scheme" });
      continue;
    }

    if (seen.has(feed.url)) {
      result.skipped += 1;
      continue;
    }
    seen.add(feed.url);

    try {
      const upsert = db.upsertSubscription({ url: feed.url, title: feed.title });
      if (upsert.inserted) result.imported += 1;
      else if (upsert.updated) result.updated += 1;
      else result.skipped += 1;
    } catch (error) {
      result.invalid += 1;
      result.errors.push({
        url: feed.url,
        message: error instanceof Error ? error.message : "Unknown import failure",
      });
    }
  }

  return result;
}
