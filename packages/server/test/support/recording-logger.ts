import type { LogFields, Logger, LoggerLevel } from "../../src/utils/logger.ts";

export interface LoggedEntry {
  level: LoggerLevel;
  message: string;
  fields?: LogFields;
}

/** A Logger that keeps what was reported, so a test asserts on it instead of scraping stdout. */
export class RecordingLogger implements Logger {
  readonly entries: LoggedEntry[] = [];

  info(message: string, fields?: LogFields): void {
    this.entries.push({ level: "info", message, fields });
  }

  warn(message: string, fields?: LogFields): void {
    this.entries.push({ level: "warn", message, fields });
  }

  error(message: string, fields?: LogFields): void {
    this.entries.push({ level: "error", message, fields });
  }

  at(level: LoggerLevel): LoggedEntry[] {
    return this.entries.filter((entry) => entry.level === level);
  }
}
