import type { Logger } from "../core/types";

export interface LoggerOptions {
  verbose?: boolean;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  return {
    info(message: string) {
      console.log(message);
    },
    warn(message: string) {
      console.warn(message);
    },
    error(message: string) {
      console.error(message);
    },
    debug(message: string) {
      if (options.verbose) {
        console.debug(message);
      }
    }
  };
}

