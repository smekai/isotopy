import type { Logger as AikiLogger } from "@aikirun/server";
import type { LogFields, Logger } from "../utils/logger.ts";

export class AikiLoggerAdapter implements AikiLogger {
  constructor(
    private readonly logger: Logger,
    private readonly bindings: LogFields = {},
  ) {}

  trace(): void {}

  debug(): void {}

  info(): void {}

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.logger.warn(message, { ...this.bindings, ...metadata });
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.logger.error(message, { ...this.bindings, ...metadata });
  }

  child(bindings: Record<string, unknown>): AikiLogger {
    return new AikiLoggerAdapter(this.logger, { ...this.bindings, ...bindings });
  }
}
