import WebSocket from "ws";
import { loadOutboundMediaFromUrl } from "openclaw/plugin-sdk/outbound-media";
import { hasAlphaChannel, resizeToJpeg, resizeToPng } from "openclaw/plugin-sdk/media-runtime";
import type {
  AgenrenaImageRef,
  AgenrenaPresignImagesResult,
  AgenrenaSendResult,
  AgenrenaTextFormat,
  AgenrenaWsEvent,
  ResolvedAgenrenaAccount,
} from "./types.js";

const DEFAULT_HOST = "api.agenrena.com";
const AGENRENA_THUMBNAIL_MAX_SIDE = 512;
const AGENRENA_THUMBNAIL_JPEG_QUALITY = 82;

type OutboundMediaAccessParams = {
  mediaAccess?: {
    localRoots?: readonly string[];
    readFile?: (filePath: string) => Promise<Buffer>;
  };
  mediaLocalRoots?: readonly string[];
  mediaReadFile?: (filePath: string) => Promise<Buffer>;
};

function resolveHost(account: ResolvedAgenrenaAccount): string {
  return account.host || DEFAULT_HOST;
}

function buildReplyToBody(replyTo?: string | null): Record<string, string> {
  return replyTo ? { reply_to_message_id: replyTo } : {};
}

function isImageContentType(contentType: string | undefined): boolean {
  return Boolean(contentType?.trim().toLowerCase().startsWith("image/"));
}

async function requestAgenrenaJson<T>(params: {
  account: ResolvedAgenrenaAccount;
  path: string;
  method?: string;
  body?: Record<string, unknown>;
}): Promise<T> {
  const url = `https://${resolveHost(params.account)}${params.path}`;
  const res = await fetch(url, {
    method: params.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.account.apiKey}`,
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`Agenrena request failed: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as T;
}

async function buildThumbnailBuffer(
  buffer: Buffer,
): Promise<{ buffer: Buffer; contentType: "image/png" | "image/jpeg" }> {
  const preserveAlpha = await hasAlphaChannel(buffer).catch(() => false);
  if (preserveAlpha) {
    return {
      buffer: await resizeToPng({
        buffer,
        maxSide: AGENRENA_THUMBNAIL_MAX_SIDE,
        compressionLevel: 6,
        withoutEnlargement: true,
      }),
      contentType: "image/png",
    };
  }

  return {
    buffer: await resizeToJpeg({
      buffer,
      maxSide: AGENRENA_THUMBNAIL_MAX_SIDE,
      quality: AGENRENA_THUMBNAIL_JPEG_QUALITY,
      withoutEnlargement: true,
    }),
    contentType: "image/jpeg",
  };
}

async function uploadToPresignedPutUrl(params: {
  uploadUrl: string;
  buffer: Buffer;
  contentType?: string;
}): Promise<void> {
  const res = await fetch(params.uploadUrl, {
    method: "PUT",
    headers: params.contentType ? { "Content-Type": params.contentType } : undefined,
    body: new Uint8Array(params.buffer),
  });

  if (!res.ok) {
    throw new Error(`Agenrena upload failed: ${res.status} ${res.statusText}`);
  }
}

export async function presignAgenrenaImages(params: {
  account: ResolvedAgenrenaAccount;
  count: number;
}): Promise<AgenrenaPresignImagesResult> {
  return await requestAgenrenaJson<AgenrenaPresignImagesResult>({
    account: params.account,
    path: "/api/agent-api/channels/messages/images/presign/",
    method: "POST",
    body: { count: params.count },
  });
}

export async function sendAgenrenaTextMessage(params: {
  account: ResolvedAgenrenaAccount;
  channelId: string;
  text: string;
  textFormat?: AgenrenaTextFormat;
  replyTo?: string | null;
}): Promise<AgenrenaSendResult> {
  const { account, channelId, text, textFormat, replyTo } = params;
  return await requestAgenrenaJson<AgenrenaSendResult>({
    account,
    path: "/api/agent-api/channels/messages/send/",
    method: "POST",
    body: {
      conversation_id: channelId,
      message_type: "text",
      text_format: textFormat ?? "markdown",
      text,
      ...buildReplyToBody(replyTo),
    },
  });
}

export async function sendAgenrenaImageMessage(params: {
  account: ResolvedAgenrenaAccount;
  channelId: string;
  images: AgenrenaImageRef[];
  replyTo?: string | null;
}): Promise<AgenrenaSendResult> {
  return await requestAgenrenaJson<AgenrenaSendResult>({
    account: params.account,
    path: "/api/agent-api/channels/messages/send/",
    method: "POST",
    body: {
      conversation_id: params.channelId,
      message_type: "image",
      images: params.images,
      ...buildReplyToBody(params.replyTo),
    },
  });
}

export async function sendAgenrenaMediaMessage(
  params: {
    account: ResolvedAgenrenaAccount;
    channelId: string;
    mediaUrls: string[];
    text?: string;
    replyTo?: string | null;
  } & OutboundMediaAccessParams,
): Promise<AgenrenaSendResult> {
  const mediaUrls = params.mediaUrls.map((entry) => entry.trim()).filter(Boolean);
  if (mediaUrls.length === 0) {
    const text = params.text?.trim();
    if (!text) {
      throw new Error("Agenrena media send requires at least one media URL or non-empty text.");
    }
    return await sendAgenrenaTextMessage({
      account: params.account,
      channelId: params.channelId,
      text,
      replyTo: params.replyTo,
    });
  }

  const loadedMedia = await Promise.all(
    mediaUrls.map(async (mediaUrl) => {
      const loaded = await loadOutboundMediaFromUrl(mediaUrl, {
        mediaAccess: params.mediaAccess,
        mediaLocalRoots: params.mediaLocalRoots,
        mediaReadFile: params.mediaReadFile,
      });
      if (loaded.kind !== "image" && !isImageContentType(loaded.contentType)) {
        throw new Error(`Agenrena only supports outbound image replies (got ${loaded.contentType ?? "unknown"}).`);
      }
      const thumbnail = await buildThumbnailBuffer(loaded.buffer);
      return {
        buffer: loaded.buffer,
        contentType: loaded.contentType,
        thumbnailBuffer: thumbnail.buffer,
        thumbnailContentType: thumbnail.contentType,
      };
    }),
  );

  const presigned = await presignAgenrenaImages({
    account: params.account,
    count: loadedMedia.length,
  });
  if (presigned.images.length !== loadedMedia.length) {
    throw new Error(
      `Agenrena presign count mismatch: requested ${loadedMedia.length}, received ${presigned.images.length}.`,
    );
  }

  await Promise.all(
    presigned.images.map(async (entry, index) => {
      const media = loadedMedia[index];
      await uploadToPresignedPutUrl({
        uploadUrl: entry.image_upload_url,
        buffer: media.buffer,
        contentType: media.contentType,
      });
      await uploadToPresignedPutUrl({
        uploadUrl: entry.thumbnail_upload_url,
        buffer: media.thumbnailBuffer,
        contentType: media.thumbnailContentType,
      });
    }),
  );

  // Agenrena treats image and text as mutually exclusive message types.
  // Send image first (primary content, more likely to fail), then text as a separate message.
  const imageResult = await sendAgenrenaImageMessage({
    account: params.account,
    channelId: params.channelId,
    images: presigned.images.map((entry) => ({ id: entry.id })),
    replyTo: params.replyTo,
  });

  const text = params.text?.trim();
  if (text) {
    await sendAgenrenaTextMessage({
      account: params.account,
      channelId: params.channelId,
      text,
      replyTo: params.replyTo,
    });
  }

  return imageResult;
}

/** Create a WebSocket connection to Agenrena for receiving events. */
export function createAgenrenaWsClient(params: {
  account: ResolvedAgenrenaAccount;
  onMessage: (event: AgenrenaWsEvent) => void;
  onError?: (err: Error) => void;
  onClose?: () => void;
  abortSignal?: AbortSignal;
}): WebSocket {
  const { account, onMessage, onError, onClose, abortSignal } = params;
  const host = resolveHost(account);
  const url = `wss://${host}/ws/agent/events/?token=${account.apiKey}`;

  const ws = new WebSocket(url);

  ws.on("message", (raw) => {
    try {
      const parsed = JSON.parse(String(raw)) as AgenrenaWsEvent;
      if (parsed.id && parsed.conversation_id && parsed.sender?.id) {
        onMessage(parsed);
      }
    } catch {
      onError?.(new Error("agenrena: failed to parse WebSocket message"));
    }
  });

  ws.on("error", (err) => {
    onError?.(err instanceof Error ? err : new Error(String(err)));
  });

  ws.on("close", () => {
    onClose?.();
  });

  if (abortSignal) {
    const handleAbort = () => {
      ws.close();
    };
    if (abortSignal.aborted) {
      ws.close();
    } else {
      abortSignal.addEventListener("abort", handleAbort, { once: true });
    }
  }

  return ws;
}

/** Send a message to Agenrena via REST API. */
export async function sendAgenrenaMessage(params: {
  account: ResolvedAgenrenaAccount;
  channelId: string;
  text: string;
  textFormat?: AgenrenaTextFormat;
  replyTo?: string | null;
}): Promise<AgenrenaSendResult> {
  return await sendAgenrenaTextMessage(params);
}
