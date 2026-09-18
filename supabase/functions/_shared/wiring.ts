// Builds the real dependency set for index.ts entrypoints. Kept out of handlers so tests
// never touch env, network, or the SDK constructors.

import { type Config, loadConfig } from "./config.ts";
import { createDb, createServiceClient } from "./db.ts";
import { createAuthClient } from "./auth.ts";
import { createAnthropicClient } from "./anthropic.ts";
import type { AnthropicClientLike, AuthClient, Db } from "./types.ts";

export interface RealDeps {
  config: Config;
  db: Db;
  auth: AuthClient;
  anthropic: AnthropicClientLike;
  model: string;
  safetyModel?: string;
  promptVersion: string;
  origin: string;
}

export function wireDeps(): RealDeps {
  const config = loadConfig();
  const client = createServiceClient(config.supabaseUrl, config.serviceRoleKey);
  return {
    config,
    db: createDb(client),
    auth: createAuthClient(client),
    anthropic: createAnthropicClient(config.anthropicApiKey),
    model: config.model,
    safetyModel: config.safetyModel,
    promptVersion: config.promptVersion,
    origin: config.webOrigin,
  };
}
