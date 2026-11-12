import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — check your .env file.'
  );
}

// This is the "publishable"/anon key — it's meant to be embedded in a
// client app. It can only do what our Row Level Security policies allow
// (see supabase_migration.sql). Never put the "secret"/service_role key
// here or anywhere in this app.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// A throwaway client that never stores or refreshes a session. The owner
// sign-in uses it to check an account's role BEFORE the real client signs in,
// so a non-owner trying the owner login is turned away without ever touching
// the visitor's current (guest) session.
export function createProbeClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'mtpickle-owner-probe',
    },
  });
}
