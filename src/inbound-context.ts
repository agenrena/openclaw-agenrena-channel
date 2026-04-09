import { fetchRemoteMedia, saveMediaBuffer } from "openclaw/plugin-sdk/media-runtime";
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

async function downloadAgenrenaImages(
  images: AgenrenaImage[],
): Promise<{ paths: string[]; types: string[] }> {
  const paths: string[] = [];
  const types: string[] = [];
  for (const img of images) {
    try {
      const fetched = await fetchRemoteMedia({ url: img.url });
      const contentType = fetched.contentType || img.mime_type;
      const saved = await saveMediaBuffer(fetched.buffer, contentType, "inbound");
      paths.push(saved.path);
      types.push(saved.contentType || contentType);
    } catch (err) {
      console.error(`agenrena: failed to download image ${img.id}: ${String(err)}`);
    }
  }
  return { paths, types };
}

export async function buildAgenrenaInboundContext<TContext>(params: {
  finalizeInboundContext: (ctx: Record<string, unknown>) => TContext;
  account: ResolvedAgenrenaAccount;
  msg: AgenrenaInboundMessage;
  sessionKey: string;
}): Promise<TContext> {
  const { account, msg, sessionKey } = params;
  const untrustedContext = buildAgenrenaUntrustedContext(msg.context);

  const media =
    msg.images.length > 0 ? await downloadAgenrenaImages(msg.images) : null;

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
    ...(media && media.paths.length > 0 && {
      MediaPath: media.paths[0],
      MediaType: media.types[0],
      MediaPaths: media.paths,
      MediaTypes: media.types,
    }),
  });
}
