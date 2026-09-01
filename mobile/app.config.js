const value = (name) => process.env[name]?.trim() || "";

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    SUPABASE_URL: value("EXPO_PUBLIC_SUPABASE_URL"),
    SUPABASE_ANON_KEY: value("EXPO_PUBLIC_SUPABASE_ANON_KEY"),
    API_BASE_URL: value("EXPO_PUBLIC_API_BASE_URL"),
  },
});
