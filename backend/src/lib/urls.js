// Runtime env + URL helpers shared across route modules.
// Determine environment mode (supports NODE_ENV set via env or .env)
const nodeEnv = process.env.NODE_ENV || "development";
const isDevelopment = nodeEnv === "development";

// Helper: Get frontend URL based on environment
function getFrontendUrl() {
  if (isDevelopment) {
    // Development mode: prefer TEST_ variables, fallback to regular, then dev default
    return (
      process.env.TEST_FRONTEND_URL ||
      process.env.FRONTEND_URL ||
      "http://localhost:5173"
    );
  }

  // In production, FRONTEND_URL must be explicitly configured
  if (!process.env.FRONTEND_URL) {
    throw new Error(
      "FRONTEND_URL environment variable is required in production.",
    );
  }

  return process.env.FRONTEND_URL;
}

// Helper: Build absolute backend URL from the incoming crawler request. Works
// regardless of where the server is hosted because we read the actual Host
// header (and respect X-Forwarded-Proto behind a proxy/CDN).
function getBackendUrlFromReq(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.get("host");
  return `${proto}://${host}`;
}
export { nodeEnv, isDevelopment, getFrontendUrl, getBackendUrlFromReq };
