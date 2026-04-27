function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const env = {
  x: {
    apiKey: () => required("X_API_KEY"),
    apiKeySecret: () => required("X_API_KEY_SECRET"),
    accessToken: () => required("X_ACCESS_TOKEN"),
    accessTokenSecret: () => required("X_ACCESS_TOKEN_SECRET"),
    bearerToken: () => optional("X_BEARER_TOKEN"),
  },
  supabase: {
    url: () => required("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  },
  anthropicApiKey: () => optional("ANTHROPIC_API_KEY"),
  dryRun: () => (process.env.DRY_RUN ?? "true").toLowerCase() !== "false",
  dailyBudgetUsd: () => Number(process.env.DAILY_BUDGET_USD ?? "2.00"),
  cronSecret: () => optional("CRON_SECRET"),
};
