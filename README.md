# rss-mcp

> A minimal, MCP-first RSS reader for agents.

`rss-mcp` is a lightweight CLI app whose primary job is to expose your RSS subscriptions through a **Model Context Protocol (MCP)** server.

- Imports subscriptions from **OPML**
- Fetches feeds on demand
- Persists data in **SQLite**
- Exposes agent-friendly MCP tools over **stdio**

## Why this project?

Most RSS tools are UI-first. This one is **agent-first**.

If your assistant can connect to MCP, it can:
- pull updates from your feeds,
- list and filter entries,
- and track read/unread state.

## Features

- MCP server over stdio
- OPML import (`xmlUrl`) with upsert by feed URL
- Manual refresh model (agent-triggered)
- SQLite storage for subscriptions, entries, and read state
- JSON responses designed for tool use

## Tech Stack

- Node.js (20+)
- TypeScript
- `@modelcontextprotocol/sdk`
- `better-sqlite3`
- `rss-parser`
- `fast-xml-parser`
- `zod`

## Quickstart

### 1. Install dependencies

```bash
npm install
```

### 2. Run in dev mode

```bash
npm run dev
```

### 3. (Optional) Bootstrap subscriptions from OPML

```bash
npm run dev -- --opml ./subscriptions.opml
```

### 4. Build + run production bundle

```bash
npm run build
node dist/index.js serve --db ./data/rss-mcp.sqlite --opml ./subscriptions.opml
```

## Configuration

CLI flags override environment variables.

### CLI

```bash
rss-mcp serve [--db <path>] [--opml <path>]
```

### Environment Variables

- `RSS_MCP_DB_PATH` (default: `./data/rss-mcp.sqlite`)
- `RSS_MCP_OPML_PATH` (optional)
- `RSS_MCP_LOG_LEVEL` (`error` | `warn` | `info`, default: `info`)

## Connect as MCP Server

The server runs over **stdio**, so MCP clients should launch it as a command.

Example command:

```bash
node /absolute/path/to/rss-mcp/dist/index.js serve --db /absolute/path/to/rss-mcp/data/rss-mcp.sqlite
```

If your MCP host supports env config, you can set:

```bash
RSS_MCP_DB_PATH=/absolute/path/rss-mcp.sqlite
RSS_MCP_OPML_PATH=/absolute/path/subscriptions.opml
```

## MCP Tools

All tools return JSON in text content with `ok: true|false`.

### `import_opml`

Import feeds from an OPML file.

Input:
```json
{ "path": "/absolute/path/subscriptions.opml" }
```

### `list_subscriptions`

List tracked subscriptions.

Input:
```json
{ "limit": 50, "offset": 0 }
```

### `refresh_feeds`

Fetch latest items for all feeds or a subset.

Input examples:
```json
{}
```
```json
{ "subscriptionIds": [1, 2, 3] }
```
```json
{ "urls": ["https://example.com/feed.xml"] }
```

### `list_entries`

Query stored entries with filters.

Input examples:
```json
{ "limit": 20, "offset": 0 }
```
```json
{ "subscriptionId": 2, "isRead": false, "limit": 50 }
```

### `get_entry`

Get full stored details for one entry.

Input:
```json
{ "entryId": 123 }
```

### `mark_entry_read`

Mark entry as read/unread.

Input examples:
```json
{ "entryId": 123 }
```
```json
{ "entryId": 123, "isRead": false }
```

## Data Model (SQLite)

- `subscriptions`
- `entries`
- `entry_states`

Designed for PoC simplicity with durable local storage.

## Development

```bash
npm run typecheck
npm test
```

## Project Status

PoC / early-stage. Focus is correctness and MCP interoperability over broad feature surface.

## License

No license file is currently included.
