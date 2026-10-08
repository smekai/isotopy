import type { Logger as AikiLogger } from "@aikirun/server";
import { pino } from "pino";
import type { Logger as Pino } from "pino";
import pretty from "pino-pretty";
import type { LogFields, Logger } from "./logger.ts";

export class PinoLogger implements Logger, AikiLogger {
  private constructor(
    private readonly root: Pino,
    private readonly pino: Pino,
  ) {}

  static toConsoleAndFile(file: string): PinoLogger {
    const streams = pino.multistream([
      { stream: pretty({ colorize: process.stdout.isTTY, ignore: "pid,hostname", sync: true }) },
      { stream: pino.destination({ dest: file, mkdir: true, sync: true }) },
    ]);
    const root = pino({ serializers: { error: pino.stdSerializers.err } }, streams);
    return new PinoLogger(root, root);
  }

  trace(message: string, fields?: LogFields): void {
    this.pino.trace(fields ?? {}, message);
  }

  debug(message: string, fields?: LogFields): void {
    this.pino.debug(fields ?? {}, message);
  }

  info(message: string, fields?: LogFields): void {
    this.pino.info(fields ?? {}, message);
  }

  warn(message: string, fields?: LogFields): void {
    this.pino.warn(fields ?? {}, message);
  }

  error(message: string, fields?: LogFields): void {
    this.pino.error(fields ?? {}, message);
  }

  child(scope: string | LogFields): PinoLogger {
    return typeof scope === "string"
      ? new PinoLogger(this.root, this.root.child({ component: scope }))
      : new PinoLogger(this.root, this.pino.child(scope));
  }
}
