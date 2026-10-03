import { pino } from "pino";
import type { Logger as Pino } from "pino";
import pretty from "pino-pretty";
import type { LogFields, Logger } from "./logger.ts";

export class PinoLogger implements Logger {
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

  info(message: string, fields?: LogFields): void {
    this.pino.info(fields ?? {}, message);
  }

  warn(message: string, fields?: LogFields): void {
    this.pino.warn(fields ?? {}, message);
  }

  error(message: string, fields?: LogFields): void {
    this.pino.error(fields ?? {}, message);
  }

  child(component: string): Logger {
    return new PinoLogger(this.root, this.root.child({ component }));
  }
}
