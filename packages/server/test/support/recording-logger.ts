import type { LogFields, Logger, LoggerLevel } from "../../src/utils/logger.ts";

export interface LoggedEntry {
  level: LoggerLevel;
  message: string;
  component?: string;
  fields?: LogFields;
}

/**
 * A Logger that keeps what was reported, so a test asserts on it instead of
 * scraping stdout. Every child shares one list and stamps its component.
 */
export class RecordingLogger implements Logger {
  constructor(
    readonly entries: LoggedEntry[] = [],
    private readonly component?: string,
  ) {}

  info(message: string, fields?: LogFields): void {
    this.record("info", message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.record("warn", message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.record("error", message, fields);
  }

  child(component: string): Logger {
    return new RecordingLogger(this.entries, component);
  }

  at(level: LoggerLevel): LoggedEntry[] {
    return this.entries.filter((entry) => entry.level === level);
  }

  private record(level: LoggerLevel, message: string, fields?: LogFields): void {
    this.entries.push({ level, message, component: this.component, fields });
  }
}
