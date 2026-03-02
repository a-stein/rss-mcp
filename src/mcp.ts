import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RssDatabase } from "./db.js";
import { z } from "zod";
import { importOpmlFile } from "./opml.js";
import { refreshFeeds } from "./feeds.js";
import { ToolError, toToolError } from "./errors.js";
import type { Logger } from "./logger.js";

function asTextJson(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function throwIfNotFound<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new ToolError("NOT_FOUND", message);
  }
  return value;
}

export function createRssMcpServer(db: RssDatabase, logger: Logger): McpServer {
  const server = new McpServer({
    name: "rss-mcp",
    version: "0.1.0",
  });

  server.tool(
    "import_opml",
    {
      path: z.string().min(1),
    },
    async ({ path }) => {
      try {
        const result = importOpmlFile(db, path);
        logger.info("OPML imported", { path, totals: result });
        return asTextJson({ ok: true, result });
      } catch (error) {
        const err = toToolError(error);
        logger.error("OPML import failed", err.toShape());
        return asTextJson({ ok: false, error: err.toShape() });
      }
    },
  );

  server.tool(
    "list_subscriptions",
    {
      limit: z.number().int().positive().max(1000).optional(),
      offset: z.number().int().min(0).optional(),
    },
    async ({ limit, offset }) => {
      try {
        const result = db.listSubscriptions(limit, offset);
        return asTextJson({ ok: true, ...result });
      } catch (error) {
        const err = toToolError(error);
        return asTextJson({ ok: false, error: err.toShape() });
      }
    },
  );

  server.tool(
    "refresh_feeds",
    {
      subscriptionIds: z.array(z.number().int().positive()).optional(),
      urls: z.array(z.string().url()).optional(),
    },
    async ({ subscriptionIds, urls }) => {
      try {
        const hasIds = Boolean(subscriptionIds?.length);
        const hasUrls = Boolean(urls?.length);

        const subscriptions = hasIds
          ? db.getSubscriptionsByIds(subscriptionIds ?? [])
          : hasUrls
            ? db.getSubscriptionsByUrls(urls ?? [])
            : db.getAllSubscriptions();

        const result = await refreshFeeds(db, subscriptions);
        logger.info("Feeds refreshed", {
          selected: subscriptions.length,
          totals: result.totals,
        });
        return asTextJson({ ok: true, ...result });
      } catch (error) {
        const err = toToolError(error);
        return asTextJson({ ok: false, error: err.toShape() });
      }
    },
  );

  server.tool(
    "list_entries",
    {
      subscriptionId: z.number().int().positive().optional(),
      isRead: z.boolean().optional(),
      limit: z.number().int().positive().max(1000).optional(),
      offset: z.number().int().min(0).optional(),
    },
    async ({ subscriptionId, isRead, limit, offset }) => {
      try {
        const result = db.listEntries({ subscriptionId, isRead, limit, offset });
        return asTextJson({ ok: true, ...result });
      } catch (error) {
        const err = toToolError(error);
        return asTextJson({ ok: false, error: err.toShape() });
      }
    },
  );

  server.tool(
    "get_entry",
    {
      entryId: z.number().int().positive(),
    },
    async ({ entryId }) => {
      try {
        const entry = throwIfNotFound(db.getEntry(entryId), `Entry not found: ${entryId}`);
        return asTextJson({ ok: true, entry });
      } catch (error) {
        const err = toToolError(error);
        return asTextJson({ ok: false, error: err.toShape() });
      }
    },
  );

  server.tool(
    "mark_entry_read",
    {
      entryId: z.number().int().positive(),
      isRead: z.boolean().optional(),
    },
    async ({ entryId, isRead }) => {
      try {
        const current = db.getEntry(entryId);
        if (!current) {
          throw new ToolError("NOT_FOUND", `Entry not found: ${entryId}`);
        }

        const result = db.setEntryRead(entryId, isRead ?? true);
        return asTextJson({ ok: true, ...result });
      } catch (error) {
        const err = toToolError(error);
        return asTextJson({ ok: false, error: err.toShape() });
      }
    },
  );

  return server;
}
