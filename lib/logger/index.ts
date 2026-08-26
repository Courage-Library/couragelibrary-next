type LogLevel = "debug" | "info" | "warn" | "error";

interface LogPayload {
  message: string;
  context?: string;
  data?: unknown;
  error?: unknown;
}

class Logger {
  private formatMessage(level: LogLevel, payload: LogPayload): string {
    const timestamp = new Date().toISOString();
    const contextStr = payload.context ? `[${payload.context}]` : "";
    return `[${timestamp}] [${level.toUpperCase()}] ${contextStr} ${payload.message}`;
  }

  debug(message: string, context?: string, data?: unknown): void {
    if (process.env.NODE_ENV !== "production") {
      console.debug(this.formatMessage("debug", { message, context, data }), data ?? "");
    }
  }

  info(message: string, context?: string, data?: unknown): void {
    console.info(this.formatMessage("info", { message, context, data }), data ?? "");
  }

  warn(message: string, context?: string, data?: unknown): void {
    console.warn(this.formatMessage("warn", { message, context, data }), data ?? "");
  }

  error(message: string, context?: string, error?: unknown): void {
    console.error(this.formatMessage("error", { message, context, error }), error ?? "");
  }
}

export const logger = new Logger();
