import type { AgenrenaConfig, ResolvedAgenrenaAccount } from "./types.js";
import { resolveAgenrenaCliCredentials } from "./cli-credentials.js";

const DEFAULT_HOST = "api.agenrena.com";

type OpenClawConfig = {
  channels?: Record<string, unknown>;
};

function getAgenrenaSection(cfg: OpenClawConfig): AgenrenaConfig | undefined {
  return cfg.channels?.["agenrena"] as AgenrenaConfig | undefined;
}

/** Resolve account from OpenClaw config. */
export function resolveAgenrenaAccount(
  cfg: OpenClawConfig,
  _accountId?: string | null,
): ResolvedAgenrenaAccount {
  const section = getAgenrenaSection(cfg);
  const credentials = resolveAgenrenaCliCredentials();
  const apiKey = credentials.configured ? credentials.apiKey : undefined;

  return {
    accountId: "default",
    enabled: section?.enabled !== false && Boolean(apiKey),
    configured: Boolean(apiKey),
    apiKey,
    host: section?.host?.trim() || DEFAULT_HOST,
    allowFrom: section?.allowFrom ?? [],
    dmPolicy: section?.dmSecurity,
  };
}
