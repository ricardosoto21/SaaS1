type LogLevel = "info" | "warn" | "error";

export function logEvent(level: LogLevel, event: string, context: Record<string, string | number | boolean | undefined> = {}) {
  // Never pass request bodies, credentials, cookies, payment tokens, or client notes here.
  console[level](JSON.stringify({ level, event, timestamp: new Date().toISOString(), ...context }));
}