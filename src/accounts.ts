import type { AgenrenaConfig, ResolvedAgenrenaAccount } from "./types.js";

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
  const apiKey = section?.apiKey?.trim() || process.env.AGENRENA_API_KEY?.trim();

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

/** Inspect whether credentials are present (without requiring them). */
export function inspectAgenrenaCredentials(cfg: OpenClawConfig): boolean {
  const section = getAgenrenaSection(cfg);
  return Boolean(section?.apiKey?.trim());
}
