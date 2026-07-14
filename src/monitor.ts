import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { deliverTextOrMediaReply, type OutboundReplyPayload } from "openclaw/plugin-sdk/reply-payload";
import { createAgenrenaWsClient, registerAgenrenaAgentInfo, sendAgenrenaMediaMessage, sendAgenrenaMessage } from "./client.js";
import { buildAgenrenaInboundContext, type AgenrenaInboundMessage } from "./inbound-context.js";
import { getAgenrenaRuntime } from "./runtime.js";
import { buildAgenrenaSessionKey } from "./session-key.js";
import type { AgenrenaWsEvent, ResolvedAgenrenaAccount } from "./types.js";
import { composeAgenrenaChatTarget, parseAgenrenaChatTarget } from "./chat-target.js";

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
    channelId: params.msg.target,
    dmScope: currentCfg.session?.dmScope,
    identityLinks: currentCfg.session?.identityLinks,
  });

  const msgCtx = await buildAgenrenaInboundContext({
    finalizeInboundContext: resolvedRt.channel.reply.finalizeInboundContext,
    account: params.account,
    msg: params.msg,
    sessionKey,
  });

  const replyRoute = parseAgenrenaChatTarget(params.msg.target);

  const dispatchResult = await resolvedRt.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: msgCtx,
    cfg: currentCfg,
    dispatcherOptions: {
      deliver: async (payload: OutboundReplyPayload & { body?: string }) => {
        const text = payload.text ?? payload.body ?? "";
        const mediaCount = [payload.mediaUrl, ...(payload.mediaUrls ?? [])].filter(Boolean).length;
        params.log.info(
          `agenrena: reply payload received text_length=${text.length} media_count=${mediaCount}`,
        );
        await deliverTextOrMediaReply({
          payload: {
            text,
            mediaUrl: payload.mediaUrl,
            mediaUrls: payload.mediaUrls,
            replyToId: params.msg.messageId,
          },
          text,
          sendText: async (nextText) => {
            params.log.info(
              `agenrena: sending text reply source=${replyRoute.source} chat_id=${replyRoute.chatId}`,
            );
            const result = await sendAgenrenaMessage({
              account: params.account,
              target: params.msg.target,
              text: nextText,
              replyTo: params.msg.messageId,
            });
            params.log.info(`agenrena: text reply sent message_id=${result.message_id}`);
          },
          sendMedia: async ({ mediaUrl, caption }) => {
            params.log.info(
              `agenrena: sending media reply source=${replyRoute.source} chat_id=${replyRoute.chatId}`,
            );
            const result = await sendAgenrenaMediaMessage({
              account: params.account,
              target: params.msg.target,
              mediaUrls: [mediaUrl],
              text: caption,
              replyTo: params.msg.messageId,
            });
            params.log.info(`agenrena: media reply sent message_id=${result.message_id}`);
          },
        });
      },
      onReplyStart: () => {
        params.log.info(`agenrena: agent reply started for ${params.msg.senderId}`);
      },
    },
  });

  params.log.info(
    `agenrena: reply dispatch completed inbound_message_id=${params.msg.messageId} ` +
      `queued_final=${dispatchResult.queuedFinal} counts=${JSON.stringify(dispatchResult.counts)} ` +
      `failed_counts=${JSON.stringify(dispatchResult.failedCounts ?? {})} ` +
      `observed_delivery=${dispatchResult.observedReplyDelivery ?? false} ` +
      `send_policy_denied=${dispatchResult.sendPolicyDenied ?? false}`,
  );
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

      registerAgenrenaAgentInfo({ account }).catch((err) => {
        log.error(`agenrena: failed to register agent info: ${String(err)}`);
      });

      createAgenrenaWsClient({
        account,
        abortSignal,
        onMessage: (event: AgenrenaWsEvent) => {
          log.info(
            `agenrena: received inbound message_id=${event.id} source=${event.source} chat_id=${event.chat_id} sender_id=${event.sender.id}`,
          );
          const messageType = event.message_type ?? "text";
          if (messageType !== "text" && messageType !== "image") {
            log.info(`agenrena: skipping unsupported inbound message_type=${messageType}`);
            return;
          }
          const text = event.text ?? "";
          const images = event.images ?? [];
          if (!text.trim() && images.length === 0) {
            log.info("agenrena: skipping inbound message without text or images");
            return;
          }
          const msg: AgenrenaInboundMessage = {
            messageId: event.id,
            target: composeAgenrenaChatTarget({
              source: event.source,
              chatId: event.chat_id,
            }),
            senderId: event.sender.id,
            senderName: event.sender.display_name ?? event.sender.name ?? event.sender.id,
            text,
            messageType,
            textFormat: event.text_format,
            context: event.context,
            images,
            timestamp: new Date(event.created_at).getTime(),
          };
          dispatchInboundMessage({ account, msg, log }).catch((err) => {
            log.error(`agenrena: error dispatching message: ${String(err)}`);
          });
        },
        onError: (err) => {
          log.error(`agenrena: WebSocket error: ${String(err)}`);
        },
        onInvalidPayload: (reason) => {
          log.error(`agenrena: dropped invalid WebSocket payload: ${reason}`);
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
