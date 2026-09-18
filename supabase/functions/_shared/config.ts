// Environment + constants. Functions read secrets only here.

export interface Config {
  anthropicApiKey: string;
  anthropicWorkspaceId?: string;
  model: string;
  safetyModel?: string;
  /** Small model for the per-turn evidence extraction call (v1.1 §C). */
  extractModel: string;
  promptVersion: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  webOrigin: string;
}

export const DEFAULT_MODEL = "claude-sonnet-5";
/** Second, model-based safety layer (SPEC §7.4). Set SAFETY_MODEL=off to disable. */
export const DEFAULT_SAFETY_MODEL = "claude-haiku-4-5-20251001";
/** Per-turn extraction model (v1.1 §C). */
export const DEFAULT_EXTRACT_MODEL = "claude-haiku-4-5-20251001";
export const MAX_OUTPUT_TOKENS = 1500;
/**
 * v1.1 §C: the conversational call has no tools and only writes one short message, so a tight
 * cap keeps time-to-last-token low. Evidence is filed by the extraction call afterwards.
 */
export const TALK_MAX_OUTPUT_TOKENS = 400;
/** Output budget for non-streaming JSON generations (profile, extraction). */
export const MAX_JSON_OUTPUT_TOKENS = 4000;
/** v1.1 §B defaults. */
export const DEFAULT_MAX_TURNS = 60;
/** Patient links expire after this (SPEC §4). */
export const RESUME_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const DEFAULT_TARGET_MINUTES = 20;

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
    anthropicWorkspaceId: env.get("ANTHROPIC_WORKSPACE_ID") || undefined,
    model: env.get("ANTHROPIC_MODEL") || DEFAULT_MODEL,
    safetyModel: env.get("SAFETY_MODEL") === "off"
      ? undefined
      : env.get("SAFETY_MODEL") || DEFAULT_SAFETY_MODEL,
    extractModel: env.get("EXTRACT_MODEL") || DEFAULT_EXTRACT_MODEL,
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
