// backend/src/supabase.js
// Supabase client initialization for backend

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Determine environment mode
const isDevelopment = process.env.NODE_ENV === "development";

// Load environment-specific .env file
// In development, loads .env.development
// In production, loads .env
const envFile = isDevelopment ? ".env.development" : ".env";
dotenv.config({ path: envFile });

// In development: Use TEST_ prefixed variables if available, otherwise fall back to regular names
// In production: Always use regular variable names (SUPABASE_URL, SUPABASE_SERVICE_KEY)
let supabaseUrl, supabaseServiceKey;

if (isDevelopment) {
  // Development mode: prefer TEST_ variables, fallback to regular
  supabaseUrl = process.env.TEST_SUPABASE_URL || process.env.SUPABASE_URL;
  supabaseServiceKey =
    process.env.TEST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (process.env.TEST_SUPABASE_URL) {
    console.log("🔧 [DEV] Using TEST Supabase environment");
  } else if (process.env.SUPABASE_URL) {
    console.warn(
      "⚠️  [DEV] TEST_ variables not found, using production variables"
    );
  }
} else {
  // Production mode: always use regular variable names
  supabaseUrl = process.env.SUPABASE_URL;
  supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  // Don't log in production to avoid noise
}

if (!supabaseUrl || !supabaseServiceKey) {
  const missingVars = [];
  if (!supabaseUrl) {
    missingVars.push(
      isDevelopment ? "TEST_SUPABASE_URL or SUPABASE_URL" : "SUPABASE_URL"
    );
  }
  if (!supabaseServiceKey) {
    missingVars.push(
      isDevelopment
        ? "TEST_SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_KEY"
        : "SUPABASE_SERVICE_KEY"
    );
  }
  throw new Error(
    `Missing Supabase environment variables: ${missingVars.join(", ")}. ` +
      `Check your ${envFile} file.`
  );
}

// Service role client (bypasses RLS, for backend use only)
// This client has full database access and should NEVER be exposed to the frontend
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Test connection on import
supabase
  .from("people")
  .select("count")
  .limit(1)
  .then(() => {
    console.log("✅ Supabase connection successful");
  })
  .catch((error) => {
    console.error("❌ Supabase connection failed:", error.message);
  });
