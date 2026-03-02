import type { LogLevel } from "./types.js";

const levels: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
};

export class Logger {
  constructor(private readonly level: LogLevel) {}

  error(message: string, meta?: unknown): void {
    this.log("error", message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.log("warn", message, meta);
  }

  info(message: string, meta?: unknown): void {
    this.log("info", message, meta);
  }

  private log(level: LogLevel, message: string, meta?: unknown): void {
    if (levels[level] > levels[this.level]) return;

    const payload = {
      ts: new Date().toISOString(),
      level,
      message,
      ...(meta !== undefined ? { meta } : {}),
    };

    process.stderr.write(`${JSON.stringify(payload)}\n`);
  }
}
