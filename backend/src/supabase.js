// backend/src/supabase.js
// Supabase client initialization for backend

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.');
}

// Service role client (bypasses RLS, for backend use only)
// This client has full database access and should NEVER be exposed to the frontend
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Test connection on import
supabase.from('people').select('count').limit(1)
  .then(() => {
    console.log('✅ Supabase connection successful');
  })
  .catch((error) => {
    console.error('❌ Supabase connection failed:', error.message);
  });
