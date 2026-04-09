import type { AgenrenaImage, AgenrenaMessageType, AgenrenaTextFormat, ResolvedAgenrenaAccount } from "./types.js";

const CHANNEL_ID = "agenrena";

function buildAgenrenaUntrustedContext(context: unknown | null | undefined): string[] | undefined {
  if (context == null) {
    return undefined;
  }
  try {
    return [`Agenrena context JSON: ${JSON.stringify(context)}`];
  } catch {
    return ["Agenrena context present but could not be serialized"];
  }
}

export type AgenrenaInboundMessage = {
  messageId: string;
  channelId: string;
  senderId: string;
  senderName: string;
  text: string;
  messageType: AgenrenaMessageType;
  textFormat?: AgenrenaTextFormat;
  context?: unknown | null;
  images: AgenrenaImage[];
  timestamp: number;
};

export function buildAgenrenaInboundContext<TContext>(params: {
  finalizeInboundContext: (ctx: Record<string, unknown>) => TContext;
  account: ResolvedAgenrenaAccount;
  msg: AgenrenaInboundMessage;
  sessionKey: string;
}): TContext {
  const { account, msg, sessionKey } = params;
  const untrustedContext = buildAgenrenaUntrustedContext(msg.context);

  const mediaUrls = msg.images.map((img) => img.url);
  const mediaTypes = msg.images.map((img) => img.mime_type);

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
    UntrustedContext: untrustedContext,
    AgenrenaContext: msg.context ?? undefined,
    CommandAuthorized: true,
    ...(mediaUrls.length > 0 && {
      MediaUrl: mediaUrls[0],
      MediaType: mediaTypes[0],
      MediaUrls: mediaUrls,
      MediaTypes: mediaTypes,
    }),
  });
}
