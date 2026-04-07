import { buildAgentSessionKey } from "openclaw/plugin-sdk/core";

const CHANNEL_ID = "agenrena";

export function buildAgenrenaSessionKey(params: {
  agentId: string;
  accountId: string;
  channelId: string;
  identityLinks?: Record<string, string[]>;
}): string {
  return buildAgentSessionKey({
    agentId: params.agentId,
    channel: CHANNEL_ID,
    accountId: params.accountId,
    peer: { kind: "direct", id: params.channelId },
    dmScope: "per-account-channel-peer",
    identityLinks: params.identityLinks,
  });
}
