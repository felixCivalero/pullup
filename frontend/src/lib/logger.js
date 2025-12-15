// frontend/src/lib/logger.js
// Simple frontend logger with env-aware behavior

const isDev = import.meta.env.DEV;

function formatMessage(level, message, meta) {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level}]`;
  if (meta) {
    return `${base} ${message}`;
  }
  return `${base} ${message}`;
}

export const logger = {
  debug(message, meta) {
    if (!isDev) return;
    // eslint-disable-next-line no-console
    console.log(formatMessage("DEBUG", message, meta), meta ?? "");
  },
  info(message, meta) {
    // eslint-disable-next-line no-console
    console.log(formatMessage("INFO", message, meta), meta ?? "");
  },
  warn(message, meta) {
    // eslint-disable-next-line no-console
    console.warn(formatMessage("WARN", message, meta), meta ?? "");
  },
  error(message, meta) {
    // eslint-disable-next-line no-console
    console.error(formatMessage("ERROR", message, meta), meta ?? "");
  },
};
