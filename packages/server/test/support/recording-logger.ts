import type { Logger as AikiLogger } from "@aikirun/server";
import type { LogFields, Logger, LoggerLevel } from "../../src/utils/logger.ts";

export interface LoggedEntry {
  level: LoggerLevel;
  message: string;
  component?: string;
  fields?: LogFields;
}

/**
 * A Logger that keeps what reaches the operator log, so a test asserts on it
 * instead of scraping stdout. Every child shares one list and stamps its
 * component; trace and debug are dropped, as the operator log drops them.
 */
export class RecordingLogger implements Logger, AikiLogger {
  constructor(
    readonly entries: LoggedEntry[] = [],
    private readonly component?: string,
    private readonly bindings?: LogFields,
  ) {}

  trace(): void {}

  debug(): void {}

  info(message: string, fields?: LogFields): void {
    this.record("info", message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.record("warn", message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.record("error", message, fields);
  }

  child(scope: string | LogFields): RecordingLogger {
    return typeof scope === "string"
      ? new RecordingLogger(this.entries, scope)
      : new RecordingLogger(this.entries, this.component, { ...this.bindings, ...scope });
  }

  at(level: LoggerLevel): LoggedEntry[] {
    return this.entries.filter((entry) => entry.level === level);
  }

  private record(level: LoggerLevel, message: string, fields?: LogFields): void {
    const bound = this.bindings === undefined ? fields : { ...this.bindings, ...fields };
    this.entries.push({ level, message, component: this.component, fields: bound });
  }
}
