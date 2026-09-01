import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

export const env = {
  SUPABASE_URL: extra.SUPABASE_URL,
  SUPABASE_ANON_KEY: extra.SUPABASE_ANON_KEY,
  API_BASE_URL: extra.API_BASE_URL,
};

if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.API_BASE_URL) {
  console.warn(
    '[env] Missing operator configuration. Set EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, and EXPO_PUBLIC_API_BASE_URL before building the app.',
  );
}
