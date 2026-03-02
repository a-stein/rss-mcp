export type LogLevel = "error" | "warn" | "info";

export interface Config {
  command: "serve";
  dbPath: string;
  opmlPath?: string;
  logLevel: LogLevel;
}

export interface Subscription {
  id: number;
  url: string;
  title: string | null;
  siteUrl: string | null;
  etag: string | null;
  lastModified: string | null;
  lastFetchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Entry {
  id: number;
  subscriptionId: number;
  guid: string | null;
  link: string;
  title: string | null;
  author: string | null;
  publishedAt: string | null;
  summary: string | null;
  content: string | null;
  rawJson: string | null;
  createdAt: string;
}

export interface EntryWithState extends Entry {
  isRead: boolean;
  readAt: string | null;
  feedTitle: string | null;
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  invalid: number;
  errors: Array<{ url?: string; message: string }>;
}

export interface RefreshFeedResult {
  subscriptionId: number;
  url: string;
  fetched: boolean;
  newEntries: number;
  updatedEntries: number;
  error?: string;
}

export interface RefreshResult {
  totals: {
    feeds: number;
    fetched: number;
    failed: number;
    newEntries: number;
    updatedEntries: number;
  };
  perFeed: RefreshFeedResult[];
}

export interface ToolErrorShape {
  code: string;
  message: string;
  details?: unknown;
}
