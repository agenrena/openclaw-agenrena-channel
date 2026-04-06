import type { AgenrenaMessageType, AgenrenaTextFormat, ResolvedAgenrenaAccount } from "./types.js";

const CHANNEL_ID = "agenrena";

export type AgenrenaInboundMessage = {
  messageId: string;
  channelId: string;
  senderId: string;
  senderName: string;
  text: string;
  messageType: AgenrenaMessageType;
  textFormat?: AgenrenaTextFormat;
  timestamp: number;
};

export function buildAgenrenaInboundContext<TContext>(params: {
  finalizeInboundContext: (ctx: Record<string, unknown>) => TContext;
  account: ResolvedAgenrenaAccount;
  msg: AgenrenaInboundMessage;
  sessionKey: string;
}): TContext {
  const { account, msg, sessionKey } = params;
  return params.finalizeInboundContext({
    Body: msg.text,
    RawBody: msg.text,
    CommandBody: msg.text,
    From: `agenrena:${msg.senderId}`,
    To: `agenrena:${msg.channelId}`,
    SessionKey: sessionKey,
    AccountId: account.accountId,
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: `agenrena:${msg.channelId}`,
    ChatType: "direct",
    SenderName: msg.senderName,
    SenderId: msg.senderId,
    Provider: CHANNEL_ID,
    Surface: CHANNEL_ID,
    ConversationLabel: msg.senderName || msg.senderId,
    Timestamp: msg.timestamp,
    CommandAuthorized: true,
  });
}
