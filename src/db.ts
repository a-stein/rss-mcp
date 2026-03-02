import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { EntryWithState, Subscription } from "./types.js";

export interface UpsertSubscriptionInput {
  url: string;
  title?: string | null;
  siteUrl?: string | null;
}

export interface UpsertEntryInput {
  guid?: string | null;
  link: string;
  title?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  summary?: string | null;
  content?: string | null;
  rawJson?: string | null;
}

type EntryWithStateRow = Omit<EntryWithState, "isRead"> & { isRead: 0 | 1 };

export class RssDatabase {
  private readonly db: Database.Database;

  constructor(filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    this.init();
  }

  close(): void {
    this.db.close();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL UNIQUE,
        title TEXT,
        site_url TEXT,
        etag TEXT,
        last_modified TEXT,
        last_fetched_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscription_id INTEGER NOT NULL,
        guid TEXT,
        link TEXT NOT NULL,
        title TEXT,
        author TEXT,
        published_at TEXT,
        summary TEXT,
        content TEXT,
        raw_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
        UNIQUE(subscription_id, guid),
        UNIQUE(subscription_id, link)
      );

      CREATE TABLE IF NOT EXISTS entry_states (
        entry_id INTEGER PRIMARY KEY,
        is_read INTEGER NOT NULL DEFAULT 0,
        read_at TEXT,
        FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_entries_subscription_published
        ON entries(subscription_id, published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_entry_states_is_read
        ON entry_states(is_read);
      CREATE INDEX IF NOT EXISTS idx_entries_created
        ON entries(created_at DESC);
    `);
  }

  upsertSubscription(input: UpsertSubscriptionInput): { id: number; inserted: boolean; updated: boolean } {
    const existing = this.db
      .prepare("SELECT id, title, site_url as siteUrl FROM subscriptions WHERE url = ?")
      .get(input.url) as { id: number; title: string | null; siteUrl: string | null } | undefined;

    if (!existing) {
      const result = this.db
        .prepare(
          `
            INSERT INTO subscriptions (url, title, site_url, created_at, updated_at)
            VALUES (?, ?, ?, datetime('now'), datetime('now'))
          `,
        )
        .run(input.url, input.title ?? null, input.siteUrl ?? null);

      return { id: Number(result.lastInsertRowid), inserted: true, updated: false };
    }

    const shouldUpdateTitle = !existing.title && input.title;
    const shouldUpdateSiteUrl = !existing.siteUrl && input.siteUrl;

    if (shouldUpdateTitle || shouldUpdateSiteUrl) {
      this.db
        .prepare(
          `
            UPDATE subscriptions
            SET title = COALESCE(title, ?),
                site_url = COALESCE(site_url, ?),
                updated_at = datetime('now')
            WHERE id = ?
          `,
        )
        .run(input.title ?? null, input.siteUrl ?? null, existing.id);

      return { id: existing.id, inserted: false, updated: true };
    }

    return { id: existing.id, inserted: false, updated: false };
  }

  listSubscriptions(limit = 50, offset = 0): { items: Subscription[]; total: number } {
    const items = this.db
      .prepare(
        `
          SELECT
            id,
            url,
            title,
            site_url as siteUrl,
            etag,
            last_modified as lastModified,
            last_fetched_at as lastFetchedAt,
            created_at as createdAt,
            updated_at as updatedAt
          FROM subscriptions
          ORDER BY id ASC
          LIMIT ? OFFSET ?
        `,
      )
      .all(limit, offset) as Subscription[];

    const { total } = this.db.prepare("SELECT COUNT(*) as total FROM subscriptions").get() as { total: number };
    return { items, total };
  }

  getAllSubscriptions(): Subscription[] {
    return this.listSubscriptions(1000000, 0).items;
  }

  getSubscriptionsByIds(ids: number[]): Subscription[] {
    if (!ids.length) return [];
    const placeholders = ids.map(() => "?").join(",");
    return this.db
      .prepare(
        `
          SELECT
            id,
            url,
            title,
            site_url as siteUrl,
            etag,
            last_modified as lastModified,
            last_fetched_at as lastFetchedAt,
            created_at as createdAt,
            updated_at as updatedAt
          FROM subscriptions
          WHERE id IN (${placeholders})
          ORDER BY id ASC
        `,
      )
      .all(...ids) as Subscription[];
  }

  getSubscriptionsByUrls(urls: string[]): Subscription[] {
    if (!urls.length) return [];
    const placeholders = urls.map(() => "?").join(",");
    return this.db
      .prepare(
        `
          SELECT
            id,
            url,
            title,
            site_url as siteUrl,
            etag,
            last_modified as lastModified,
            last_fetched_at as lastFetchedAt,
            created_at as createdAt,
            updated_at as updatedAt
          FROM subscriptions
          WHERE url IN (${placeholders})
          ORDER BY id ASC
        `,
      )
      .all(...urls) as Subscription[];
  }

  updateSubscriptionFetchedMeta(subscriptionId: number, etag?: string, lastModified?: string): void {
    this.db
      .prepare(
        `
          UPDATE subscriptions
          SET etag = COALESCE(?, etag),
              last_modified = COALESCE(?, last_modified),
              last_fetched_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
        `,
      )
      .run(etag ?? null, lastModified ?? null, subscriptionId);
  }

  upsertEntry(subscriptionId: number, input: UpsertEntryInput): { entryId: number; inserted: boolean; updated: boolean } {
    const byGuid = input.guid
      ? (this.db
          .prepare(
            `
              SELECT id FROM entries
              WHERE subscription_id = ? AND guid = ?
            `,
          )
          .get(subscriptionId, input.guid) as { id: number } | undefined)
      : undefined;

    const existing =
      byGuid ??
      (this.db
        .prepare(
          `
            SELECT id FROM entries
            WHERE subscription_id = ? AND link = ?
          `,
        )
        .get(subscriptionId, input.link) as { id: number } | undefined);

    if (existing) {
      this.db
        .prepare(
          `
            UPDATE entries
            SET guid = COALESCE(?, guid),
                title = COALESCE(?, title),
                author = COALESCE(?, author),
                published_at = COALESCE(?, published_at),
                summary = COALESCE(?, summary),
                content = COALESCE(?, content),
                raw_json = COALESCE(?, raw_json)
            WHERE id = ?
          `,
        )
        .run(
          input.guid ?? null,
          input.title ?? null,
          input.author ?? null,
          input.publishedAt ?? null,
          input.summary ?? null,
          input.content ?? null,
          input.rawJson ?? null,
          existing.id,
        );

      this.db
        .prepare(
          `
            INSERT INTO entry_states (entry_id, is_read)
            VALUES (?, 0)
            ON CONFLICT(entry_id) DO NOTHING
          `,
        )
        .run(existing.id);

      return { entryId: existing.id, inserted: false, updated: true };
    }

    const insert = this.db
      .prepare(
        `
          INSERT INTO entries (
            subscription_id,
            guid,
            link,
            title,
            author,
            published_at,
            summary,
            content,
            raw_json,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `,
      )
      .run(
        subscriptionId,
        input.guid ?? null,
        input.link,
        input.title ?? null,
        input.author ?? null,
        input.publishedAt ?? null,
        input.summary ?? null,
        input.content ?? null,
        input.rawJson ?? null,
      );

    const entryId = Number(insert.lastInsertRowid);
    this.db
      .prepare(
        `
          INSERT INTO entry_states (entry_id, is_read)
          VALUES (?, 0)
        `,
      )
      .run(entryId);

    return { entryId, inserted: true, updated: false };
  }

  listEntries(filters: {
    subscriptionId?: number;
    isRead?: boolean;
    limit?: number;
    offset?: number;
  }): { items: EntryWithState[]; total: number } {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (filters.subscriptionId !== undefined) {
      clauses.push("e.subscription_id = ?");
      params.push(filters.subscriptionId);
    }

    if (filters.isRead !== undefined) {
      clauses.push("COALESCE(es.is_read, 0) = ?");
      params.push(filters.isRead ? 1 : 0);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const items = this.db
      .prepare(
        `
          SELECT
            e.id,
            e.subscription_id as subscriptionId,
            e.guid,
            e.link,
            e.title,
            e.author,
            e.published_at as publishedAt,
            e.summary,
            e.content,
            e.raw_json as rawJson,
            e.created_at as createdAt,
            COALESCE(es.is_read, 0) as isRead,
            es.read_at as readAt,
            s.title as feedTitle
          FROM entries e
          LEFT JOIN entry_states es ON es.entry_id = e.id
          LEFT JOIN subscriptions s ON s.id = e.subscription_id
          ${where}
          ORDER BY COALESCE(e.published_at, e.created_at) DESC
          LIMIT ? OFFSET ?
        `,
      )
      .all(...params, limit, offset) as EntryWithStateRow[];

    const totalQuery = this.db
      .prepare(
        `
          SELECT COUNT(*) as total
          FROM entries e
          LEFT JOIN entry_states es ON es.entry_id = e.id
          ${where}
        `,
      )
      .get(...params) as { total: number };

    return {
      items: items.map((item) => ({ ...item, isRead: item.isRead === 1 })),
      total: totalQuery.total,
    };
  }

  getEntry(entryId: number): EntryWithState | null {
    const row = this.db
      .prepare(
        `
          SELECT
            e.id,
            e.subscription_id as subscriptionId,
            e.guid,
            e.link,
            e.title,
            e.author,
            e.published_at as publishedAt,
            e.summary,
            e.content,
            e.raw_json as rawJson,
            e.created_at as createdAt,
            COALESCE(es.is_read, 0) as isRead,
            es.read_at as readAt,
            s.title as feedTitle
          FROM entries e
          LEFT JOIN entry_states es ON es.entry_id = e.id
          LEFT JOIN subscriptions s ON s.id = e.subscription_id
          WHERE e.id = ?
        `,
      )
      .get(entryId) as EntryWithStateRow | undefined;

    if (!row) return null;
    return { ...row, isRead: row.isRead === 1 };
  }

  setEntryRead(entryId: number, isRead: boolean): { entryId: number; isRead: boolean; readAt: string | null } {
    const exists = this.db.prepare("SELECT id FROM entries WHERE id = ?").get(entryId) as { id: number } | undefined;
    if (!exists) {
      throw new Error(`Entry not found: ${entryId}`);
    }

    const readAt = isRead ? new Date().toISOString() : null;
    this.db
      .prepare(
        `
          INSERT INTO entry_states (entry_id, is_read, read_at)
          VALUES (?, ?, ?)
          ON CONFLICT(entry_id) DO UPDATE SET is_read = excluded.is_read, read_at = excluded.read_at
        `,
      )
      .run(entryId, isRead ? 1 : 0, readAt);

    return { entryId, isRead, readAt };
  }
}
