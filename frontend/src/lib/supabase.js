// frontend/src/lib/supabase.js
// Supabase client for frontend (uses anon key)

import { createClient } from "@supabase/supabase-js";

// Determine environment mode
// import.meta.env.DEV is true in development (vite dev), false in production builds
// import.meta.env.MODE is 'development' in dev mode, 'production' in production builds
const isDevelopment =
  import.meta.env.DEV || import.meta.env.MODE === "development";

// In Vite, .env.development is automatically loaded when running `npm run dev`
// All variables are accessed via import.meta.env.VARIABLE_NAME (not import.meta.env.development)
// In development: Use TEST_ prefixed variables if available, otherwise fall back to regular names
// In production: Always use regular variable names (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
let supabaseUrl, supabaseAnonKey;

if (isDevelopment) {
  // Development mode: prefer TEST_ variables, fallback to regular
  // Note: Vite loads .env.development automatically, but variables are still accessed via import.meta.env
  supabaseUrl =
    import.meta.env.VITE_TEST_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  supabaseAnonKey =
    import.meta.env.VITE_TEST_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY;

  // Debug logging in development
  if (import.meta.env.VITE_TEST_SUPABASE_URL) {
    console.log("🔧 [DEV] Using TEST Supabase environment");
  } else if (import.meta.env.VITE_SUPABASE_URL) {
    console.warn(
      "⚠️  [DEV] TEST_ variables not found, using production variables"
    );
    console.log("Available env vars:", {
      MODE: import.meta.env.MODE,
      DEV: import.meta.env.DEV,
      hasTestUrl: !!import.meta.env.VITE_TEST_SUPABASE_URL,
      hasTestKey: !!import.meta.env.VITE_TEST_SUPABASE_ANON_KEY,
      hasProdUrl: !!import.meta.env.VITE_SUPABASE_URL,
      hasProdKey: !!import.meta.env.VITE_SUPABASE_ANON_KEY,
    });
  }
} else {
  // Production mode: always use regular variable names
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  // Don't log in production to avoid noise
}

if (!supabaseUrl || !supabaseAnonKey) {
  const missingVars = [];
  if (!supabaseUrl) {
    missingVars.push(
      isDevelopment
        ? "TEST_VITE_SUPABASE_URL or VITE_SUPABASE_URL"
        : "VITE_SUPABASE_URL"
    );
  }
  if (!supabaseAnonKey) {
    missingVars.push(
      isDevelopment
        ? "TEST_VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY"
        : "VITE_SUPABASE_ANON_KEY"
    );
  }
  throw new Error(
    `Missing Supabase environment variables: ${missingVars.join(", ")}. ` +
      `Check your ${isDevelopment ? ".env.development" : ".env"} file.`
  );
}

// Create Supabase client with auth enabled
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true, // For OAuth redirects
  },
});
