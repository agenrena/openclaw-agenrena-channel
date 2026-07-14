import { fetchRemoteMedia, saveMediaBuffer } from "openclaw/plugin-sdk/media-runtime";
import type { AgenrenaImage, AgenrenaMessageType, AgenrenaTextFormat, ResolvedAgenrenaAccount } from "./types.js";

const CHANNEL_ID = "agenrena";

/** Download images found in context.media and return a URL-to-local-path map. */
async function downloadContextMedia(
  context: unknown | null | undefined,
): Promise<Map<string, string>> {
  const urlToLocal = new Map<string, string>();
  if (context == null || typeof context !== "object") return urlToLocal;

  const media = (context as Record<string, unknown>).media;
  if (!Array.isArray(media)) return urlToLocal;

  for (const item of media) {
    if (
      item != null &&
      typeof item === "object" &&
      (item as Record<string, unknown>).type === "image" &&
      typeof (item as Record<string, unknown>).url === "string"
    ) {
      const url = (item as Record<string, unknown>).url as string;
      try {
        const fetched = await fetchRemoteMedia({ url });
        const contentType = fetched.contentType || "image/jpeg";
        const saved = await saveMediaBuffer(fetched.buffer, contentType, "inbound");
        urlToLocal.set(url, saved.path);
      } catch (err) {
        console.error(`agenrena: failed to download context image ${url}: ${String(err)}`);
      }
    }
  }
  return urlToLocal;
}

/** Replace remote URLs in context with local paths, then serialize. */
function buildAgenrenaUntrustedContext(
  context: unknown | null | undefined,
  urlReplacements: Map<string, string>,
): string[] | undefined {
  if (context == null) {
    return undefined;
  }
  try {
    let serialized = JSON.stringify(context);
    for (const [remoteUrl, localPath] of urlReplacements) {
      serialized = serialized.replaceAll(remoteUrl, localPath);
    }
    return [`Agenrena context JSON: ${serialized}`];
  } catch {
    return ["Agenrena context present but could not be serialized"];
  }
}

export type AgenrenaInboundMessage = {
  messageId: string;
  target: string;
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
  const contextUrlReplacements = await downloadContextMedia(msg.context);
  const untrustedContext = buildAgenrenaUntrustedContext(msg.context, contextUrlReplacements);

  const media =
    msg.images.length > 0 ? await downloadAgenrenaImages(msg.images) : null;

  return params.finalizeInboundContext({
    Body: msg.text,
    RawBody: msg.text,
    CommandBody: msg.text,
    From: `agenrena:${msg.senderId}`,
    To: `agenrena:${msg.target}`,
    SessionKey: sessionKey,
    AccountId: account.accountId,
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: `agenrena:${msg.target}`,
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
