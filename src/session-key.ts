import { buildAgentSessionKey } from "openclaw/plugin-sdk/routing";

const CHANNEL_ID = "agenrena";

type DmScope = Parameters<typeof buildAgentSessionKey>[0]["dmScope"];

export function buildAgenrenaSessionKey(params: {
  agentId: string;
  accountId: string;
  channelId: string;
  dmScope?: DmScope;
  identityLinks?: Record<string, string[]>;
}): string {
  return buildAgentSessionKey({
    agentId: params.agentId,
    channel: CHANNEL_ID,
    accountId: params.accountId,
    peer: { kind: "direct", id: params.channelId },
    dmScope: params.dmScope,
    identityLinks: params.identityLinks,
  });
}
