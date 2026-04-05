import WebSocket from "ws";
import type { AgenrenaSendResult, AgenrenaWsEvent, ResolvedAgenrenaAccount } from "./types.js";

const DEFAULT_HOST = "api.agenrena.com";

function resolveHost(account: ResolvedAgenrenaAccount): string {
  return account.host || DEFAULT_HOST;
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

  ws.on("open", () => {
    console.log(`agenrena: WebSocket connected to ${host}`);
  });

  ws.on("message", (raw) => {
    const rawStr = String(raw);
    console.log(`agenrena: WS raw message received: ${rawStr.slice(0, 500)}`);
    try {
      const parsed = JSON.parse(rawStr) as AgenrenaWsEvent;
      console.log(`agenrena: parsed message id: ${parsed.id}`);
      if (parsed.id && parsed.conversation_id && parsed.sender?.id) {
        onMessage(parsed);
      }
    } catch (err) {
      console.error(`agenrena: WS message parse error: ${String(err)}`);
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
  replyTo?: string;
}): Promise<AgenrenaSendResult> {
  const { account, channelId, text, replyTo } = params;
  const host = resolveHost(account);
  const url = `https://${host}/api/agent-api/channels/messages/send/`;

  const body: Record<string, string> = {
    conversation_id: channelId,
    text,
  };
  if (replyTo) {
    body.reply_to_message_id = replyTo;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${account.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Agenrena send failed: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as AgenrenaSendResult;
}
