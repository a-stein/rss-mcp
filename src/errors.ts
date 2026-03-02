import type { ToolErrorShape } from "./types.js";

export class ToolError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }

  toShape(): ToolErrorShape {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export function toToolError(error: unknown): ToolError {
  if (error instanceof ToolError) return error;
  if (error instanceof Error) return new ToolError("INTERNAL_ERROR", error.message);
  return new ToolError("INTERNAL_ERROR", "Unknown error", { error });
}
