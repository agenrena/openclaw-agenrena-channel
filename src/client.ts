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
import { buildAgenrenaHubRouteFields, parseAgenrenaChatTarget } from "./chat-target.js";

const DEFAULT_HOST = "api.agenrena.com";
const AGENRENA_THUMBNAIL_MAX_SIDE = 300;
const AGENRENA_THUMBNAIL_JPEG_QUALITY = 80;
const AGENRENA_ERROR_BODY_MAX_LENGTH = 2_000;
// Temporary compatibility until the backend accepts agenrena-openclaw-plugin/<version>.
const AGENRENA_USER_AGENT = "agenrena-hermes-adapter/0.4.0";

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
      "User-Agent": AGENRENA_USER_AGENT,
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
  });

  if (!res.ok) {
    const responseBody = await res.text().catch(() => "");
    const normalizedBody = responseBody.trim().slice(0, AGENRENA_ERROR_BODY_MAX_LENGTH);
    throw new Error(
      `Agenrena request failed: ${res.status} ${res.statusText}${
        normalizedBody ? `: ${normalizedBody}` : ""
      }`,
    );
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
  source: string;
  count: number;
}): Promise<AgenrenaPresignImagesResult> {
  return await requestAgenrenaJson<AgenrenaPresignImagesResult>({
    account: params.account,
    path: "/api/agent-api/hub/media/presign/",
    method: "POST",
    body: { source: params.source, count: params.count },
  });
}

export async function sendAgenrenaTextMessage(params: {
  account: ResolvedAgenrenaAccount;
  target: string;
  text: string;
  textFormat?: AgenrenaTextFormat;
  replyTo?: string | null;
}): Promise<AgenrenaSendResult> {
  const { account, target, text, textFormat, replyTo } = params;
  const route = buildAgenrenaHubRouteFields(target);
  return await requestAgenrenaJson<AgenrenaSendResult>({
    account,
    path: "/api/agent-api/channels/messages/send/",
    method: "POST",
    body: {
      ...route,
      message_type: "text",
      text_format: textFormat ?? "markdown",
      text,
      ...buildReplyToBody(replyTo),
    },
  });
}

export async function sendAgenrenaImageMessage(params: {
  account: ResolvedAgenrenaAccount;
  target: string;
  images: AgenrenaImageRef[];
  replyTo?: string | null;
}): Promise<AgenrenaSendResult> {
  const route = buildAgenrenaHubRouteFields(params.target);
  return await requestAgenrenaJson<AgenrenaSendResult>({
    account: params.account,
    path: "/api/agent-api/channels/messages/send/",
    method: "POST",
    body: {
      ...route,
      message_type: "image",
      images: params.images,
      ...buildReplyToBody(params.replyTo),
    },
  });
}

export async function sendAgenrenaMediaMessage(
  params: {
    account: ResolvedAgenrenaAccount;
    target: string;
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
      target: params.target,
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

  const route = parseAgenrenaChatTarget(params.target);
  const presigned = await presignAgenrenaImages({
    account: params.account,
    source: route.source,
    count: loadedMedia.length,
  });
  if (presigned.media.length !== loadedMedia.length) {
    throw new Error(
      `Agenrena presign count mismatch: requested ${loadedMedia.length}, received ${presigned.media.length}.`,
    );
  }

  await Promise.all(
    presigned.media.map(async (entry, index) => {
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
    target: params.target,
    images: presigned.media.map((entry) => ({ id: entry.id })),
    replyTo: params.replyTo,
  });

  const text = params.text?.trim();
  if (text) {
    await sendAgenrenaTextMessage({
      account: params.account,
      target: params.target,
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
  onInvalidPayload?: (reason: string) => void;
  onClose?: () => void;
  abortSignal?: AbortSignal;
}): WebSocket {
  const { account, onMessage, onError, onInvalidPayload, onClose, abortSignal } = params;
  const host = resolveHost(account);
  const url = `wss://${host}/ws/agent/events/?token=${account.apiKey}`;

  const ws = new WebSocket(url);

  ws.on("message", (raw) => {
    try {
      const parsed = JSON.parse(String(raw)) as AgenrenaWsEvent;
      const missing = [
        !parsed.id && "id",
        !parsed.source && "source",
        !parsed.chat_id && "chat_id",
        !parsed.sender?.id && "sender.id",
      ].filter(Boolean) as string[];
      if (missing.length > 0) {
        onInvalidPayload?.(`missing required fields: ${missing.join(", ")}`);
        return;
      }
      onMessage(parsed);
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

export type AgenrenaSlashCommand = {
  name: string;
  description: string;
  aliases?: string[];
  args_hint?: string;
};

/** Report agent type and optional slash commands to Agenrena. */
export async function registerAgenrenaAgentInfo(params: {
  account: ResolvedAgenrenaAccount;
  agentType?: string;
  slashCommands?: AgenrenaSlashCommand[];
}): Promise<void> {
  const body: Record<string, unknown> = {
    agent_type: params.agentType ?? "openclaw",
  };
  if (params.slashCommands && params.slashCommands.length > 0) {
    body["slash_commands"] = params.slashCommands;
  }
  await requestAgenrenaJson<unknown>({
    account: params.account,
    path: "/api/agent-api/agents/me/",
    method: "PATCH",
    body,
  });
}

/** Send a message to Agenrena via REST API. */
export async function sendAgenrenaMessage(params: {
  account: ResolvedAgenrenaAccount;
  target: string;
  text: string;
  textFormat?: AgenrenaTextFormat;
  replyTo?: string | null;
}): Promise<AgenrenaSendResult> {
  return await sendAgenrenaTextMessage(params);
}
