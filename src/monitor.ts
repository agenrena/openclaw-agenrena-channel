import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { sendAgenrenaMessage, createAgenrenaWsClient } from "./client.js";
import { buildAgenrenaInboundContext, type AgenrenaInboundMessage } from "./inbound-context.js";
import { getAgenrenaRuntime } from "./runtime.js";
import { buildAgenrenaSessionKey } from "./session-key.js";
import type { AgenrenaWsEvent, ResolvedAgenrenaAccount } from "./types.js";

const CHANNEL_ID = "agenrena";
const RECONNECT_DELAY_MS = 5_000;

type MonitorLog = {
  info: (msg: string) => void;
  error: (msg: string) => void;
};

function defaultLog(): MonitorLog {
  return {
    info: (msg) => console.log(msg),
    error: (msg) => console.error(msg),
  };
}

function resolveInboundRoute(params: { cfg: OpenClawConfig; account: ResolvedAgenrenaAccount; senderId: string }) {
  const rt = getAgenrenaRuntime();
  const route = rt.channel.routing.resolveAgentRoute({
    cfg: params.cfg,
    channel: CHANNEL_ID,
    accountId: params.account.accountId,
    peer: {
      kind: "direct",
      id: params.senderId,
    },
  });
  return { rt, route };
}

async function dispatchInboundMessage(params: {
  account: ResolvedAgenrenaAccount;
  msg: AgenrenaInboundMessage;
  log: MonitorLog;
}): Promise<void> {
  const rt = getAgenrenaRuntime();
  const currentCfg = await rt.config.loadConfig();

  const { rt: resolvedRt, route } = resolveInboundRoute({
    cfg: currentCfg,
    account: params.account,
    senderId: params.msg.senderId,
  });

  const sessionKey = buildAgenrenaSessionKey({
    agentId: route.agentId,
    accountId: params.account.accountId,
    channelId: params.msg.channelId,
    identityLinks: currentCfg.session?.identityLinks,
  });

  const msgCtx = buildAgenrenaInboundContext({
    finalizeInboundContext: resolvedRt.channel.reply.finalizeInboundContext,
    account: params.account,
    msg: params.msg,
    sessionKey,
  });

  await resolvedRt.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: msgCtx,
    cfg: currentCfg,
    dispatcherOptions: {
      deliver: async (payload: { text?: string; body?: string }) => {
        const text = payload.text ?? payload.body;
        if (!text) return;
        await sendAgenrenaMessage({
          account: params.account,
          channelId: params.msg.channelId,
          text,
          replyTo: params.msg.messageId,
        });
      },
      onReplyStart: () => {
        params.log.info(`agenrena: agent reply started for ${params.msg.senderId}`);
      },
    },
  });
}

/** Start the WebSocket monitor with auto-reconnect. */
export async function monitorAgenrenaProvider(params: {
  account: ResolvedAgenrenaAccount;
  abortSignal?: AbortSignal;
  log?: MonitorLog;
}): Promise<void> {
  const { account, abortSignal } = params;
  const log = params.log ?? defaultLog();

  if (!account.apiKey) {
    throw new Error("Agenrena: apiKey is required");
  }

  log.info(`agenrena: starting WebSocket connection to ${account.host}...`);

  return new Promise<void>((resolve) => {
    let stopped = false;

    const handleAbort = () => {
      stopped = true;
      resolve();
    };

    if (abortSignal?.aborted) {
      resolve();
      return;
    }
    abortSignal?.addEventListener("abort", handleAbort, { once: true });

    function connect() {
      if (stopped) return;

      createAgenrenaWsClient({
        account,
        abortSignal,
        onMessage: (event: AgenrenaWsEvent) => {
          const messageType = event.message_type ?? "text";
          if (messageType !== "text") {
            log.info(`agenrena: skipping unsupported inbound message_type=${messageType}`);
            return;
          }
          const text = event.text;
          if (!text?.trim()) {
            log.info("agenrena: skipping inbound text message without text body");
            return;
          }
          const msg: AgenrenaInboundMessage = {
            messageId: event.id,
            channelId: event.conversation_id,
            senderId: event.sender.id,
            senderName: event.sender.display_name ?? event.sender.name ?? event.sender.id,
            text,
            messageType,
            textFormat: event.text_format,
            timestamp: new Date(event.created_at).getTime(),
          };
          dispatchInboundMessage({ account, msg, log }).catch((err) => {
            log.error(`agenrena: error dispatching message: ${String(err)}`);
          });
        },
        onError: (err) => {
          log.error(`agenrena: WebSocket error: ${String(err)}`);
        },
        onClose: () => {
          if (stopped) return;
          log.info(`agenrena: WebSocket closed, reconnecting in ${RECONNECT_DELAY_MS}ms...`);
          setTimeout(connect, RECONNECT_DELAY_MS);
        },
      });

      log.info("agenrena: WebSocket client started");
    }

    connect();
  });
}
