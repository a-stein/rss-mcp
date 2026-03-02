import path from "node:path";
import type { Config, LogLevel } from "./types.js";
import { ToolError } from "./errors.js";

function parseLogLevel(value: string | undefined): LogLevel {
  const v = (value ?? "info").toLowerCase();
  if (v === "error" || v === "warn" || v === "info") return v;
  throw new ToolError("INVALID_CONFIG", `Invalid log level: ${value}`);
}

export function parseConfig(argv: string[], env: NodeJS.ProcessEnv): Config {
  const command = argv[2] ?? "serve";
  if (command !== "serve") {
    throw new ToolError("INVALID_COMMAND", `Unsupported command: ${command}. Use: serve`);
  }

  const args = argv.slice(3);
  let dbPathArg: string | undefined;
  let opmlPathArg: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--db") {
      dbPathArg = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--opml") {
      opmlPathArg = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new ToolError("INVALID_COMMAND", `Unknown argument: ${arg}`);
  }

  const dbPath = path.resolve(dbPathArg ?? env.RSS_MCP_DB_PATH ?? "./data/rss-mcp.sqlite");
  const opmlPath = opmlPathArg ?? env.RSS_MCP_OPML_PATH;
  const resolvedOpml = opmlPath ? path.resolve(opmlPath) : undefined;

  return {
    command: "serve",
    dbPath,
    opmlPath: resolvedOpml,
    logLevel: parseLogLevel(env.RSS_MCP_LOG_LEVEL),
  };
}

function printHelp(): void {
  process.stdout.write(
    [
      "rss-mcp - MCP-first CLI RSS reader",
      "",
      "Usage:",
      "  rss-mcp serve [--db <path>] [--opml <path>]",
      "",
      "Env vars:",
      "  RSS_MCP_DB_PATH   SQLite file path (default: ./data/rss-mcp.sqlite)",
      "  RSS_MCP_OPML_PATH OPML file path (optional)",
      "  RSS_MCP_LOG_LEVEL error|warn|info (default: info)",
      "",
    ].join("\n"),
  );
}
