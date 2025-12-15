// backend/src/logger.js
// Lightweight backend logger wrapper

const LEVELS = ["debug", "info", "warn", "error"];

const currentLevel = process.env.LOG_LEVEL || "info";
const currentIndex = LEVELS.indexOf(currentLevel);

function shouldLog(level) {
  const idx = LEVELS.indexOf(level);
  if (idx === -1) return false;
  if (currentIndex === -1) return true;
  return idx >= currentIndex;
}

function formatMessage(level, message, meta) {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}]`;
  if (!meta) return `${base} ${message}`;
  return `${base} ${message} ${JSON.stringify(meta)}`;
}

export const logger = {
  debug(message, meta) {
    if (!shouldLog("debug")) return;
    // eslint-disable-next-line no-console
    console.log(formatMessage("debug", message, meta));
  },
  info(message, meta) {
    if (!shouldLog("info")) return;
    // eslint-disable-next-line no-console
    console.log(formatMessage("info", message, meta));
  },
  warn(message, meta) {
    if (!shouldLog("warn")) return;
    // eslint-disable-next-line no-console
    console.warn(formatMessage("warn", message, meta));
  },
  error(message, meta) {
    if (!shouldLog("error")) return;
    // eslint-disable-next-line no-console
    console.error(formatMessage("error", message, meta));
  },
};
