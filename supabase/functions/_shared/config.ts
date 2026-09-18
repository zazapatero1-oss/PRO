// Environment + constants. Functions read secrets only here.

export interface Config {
  anthropicApiKey: string;
  model: string;
  promptVersion: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  webOrigin: string;
}

export const DEFAULT_MODEL = "claude-sonnet-5";
export const MAX_OUTPUT_TOKENS = 600;
/** Output budget for non-streaming JSON generations (profile, extraction). */
export const MAX_JSON_OUTPUT_TOKENS = 4000;
export const DEFAULT_MAX_TURNS = 40;
export const DEFAULT_TARGET_MINUTES = 12;

export interface EnvReader {
  get(key: string): string | undefined;
}

export function loadConfig(env: EnvReader = Deno.env): Config {
  const require = (key: string): string => {
    const v = env.get(key);
    if (!v) throw new Error(`Missing required environment variable ${key}`);
    return v;
  };
  return {
    anthropicApiKey: require("ANTHROPIC_API_KEY"),
    model: env.get("ANTHROPIC_MODEL") || DEFAULT_MODEL,
    promptVersion: env.get("PROMPT_VERSION") || "dev",
    supabaseUrl: require("SUPABASE_URL"),
    // Supabase injects SUPABASE_SERVICE_ROLE_KEY automatically; SERVICE_ROLE_KEY is the
    // name SPEC §4 uses, accepted as an alias.
    serviceRoleKey: env.get("SUPABASE_SERVICE_ROLE_KEY") || require("SERVICE_ROLE_KEY"),
    webOrigin: env.get("WEB_ORIGIN") || "*",
  };
}

/**
 * USD per million tokens. PLACEHOLDER VALUES: verify against the current Anthropic
 * price list (https://www.anthropic.com/pricing) before relying on cost estimates.
 * Unknown models yield a null estimate rather than a wrong number.
 */
export const PRICE_TABLE_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2.0, output: 10.0 },
  "claude-opus-5": { input: 5.0, output: 25.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
};

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const price = PRICE_TABLE_USD_PER_MTOK[model];
  if (!price) return null;
  const usd = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}
