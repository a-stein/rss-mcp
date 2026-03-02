#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "node:fs";
import { parseConfig } from "./config.js";
import { Logger } from "./logger.js";
import { RssDatabase } from "./db.js";
import { createRssMcpServer } from "./mcp.js";
import { importOpmlFile } from "./opml.js";
import { toToolError } from "./errors.js";

async function main(): Promise<void> {
  const config = parseConfig(process.argv, process.env);
  const logger = new Logger(config.logLevel);
  const db = new RssDatabase(config.dbPath);

  process.on("exit", () => {
    db.close();
  });

  if (config.opmlPath) {
    if (fs.existsSync(config.opmlPath)) {
      const importResult = importOpmlFile(db, config.opmlPath);
      logger.info("Startup OPML import completed", {
        path: config.opmlPath,
        result: importResult,
      });
    } else {
      logger.warn("Startup OPML path not found", { path: config.opmlPath });
    }
  }

  const server = createRssMcpServer(db, logger);
  const transport = new StdioServerTransport();

  logger.info("Starting MCP server", {
    name: "rss-mcp",
    dbPath: config.dbPath,
  });

  await server.connect(transport);
}

main().catch((error) => {
  const e = toToolError(error);
  process.stderr.write(`${JSON.stringify({ fatal: e.toShape() })}\n`);
  process.exit(1);
});
