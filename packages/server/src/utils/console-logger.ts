import type { LogFields, Logger } from "./logger.ts";

export class ConsoleLogger implements Logger {
  info(message: string, fields?: LogFields): void {
    console.info(...consoleArguments(message, fields));
  }

  warn(message: string, fields?: LogFields): void {
    console.warn(...consoleArguments(message, fields));
  }

  error(message: string, fields?: LogFields): void {
    console.error(...consoleArguments(message, fields));
  }
}

function consoleArguments(message: string, fields?: LogFields): unknown[] {
  return fields === undefined ? [message] : [message, fields];
}
