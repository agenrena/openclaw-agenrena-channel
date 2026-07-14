import { createChatChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { createEmptyChannelDirectoryAdapter } from "openclaw/plugin-sdk/directory-runtime";
import type { ChannelOutboundAdapter } from "openclaw/plugin-sdk/channel-send-result";
import { resolveAgenrenaAccount } from "./accounts.js";
import { sendAgenrenaMediaMessage, sendAgenrenaMessage } from "./client.js";
import { monitorAgenrenaProvider } from "./monitor.js";
import { agenrenaSetupAdapter, agenrenaSetupWizard } from "./setup-surface.js";
import type { ResolvedAgenrenaAccount } from "./types.js";
import { isAgenrenaChatTarget } from "./chat-target.js";

const CHANNEL_ID = "agenrena";
type AgenrenaSendTextContext = Parameters<NonNullable<ChannelOutboundAdapter["sendText"]>>[0];
type AgenrenaSendMediaContext = Parameters<NonNullable<ChannelOutboundAdapter["sendMedia"]>>[0];

export const agenrenaPlugin = createChatChannelPlugin({
  base: {
    id: CHANNEL_ID,
    meta: {
      id: CHANNEL_ID,
      label: "Agenrena",
      selectionLabel: "Agenrena",
      docsPath: "/channels/agenrena",
      docsLabel: "agenrena",
      blurb: "Connect OpenClaw to Agenrena.",
      order: 100,
    },
    capabilities: {
      chatTypes: ["direct"],
      media: true,
      threads: false,
      reactions: false,
      edit: false,
      reply: true,
    },
    reload: { configPrefixes: [`channels.${CHANNEL_ID}`] },
    configSchema: {
      schema: {
        type: "object",
        properties: {
          enabled: { type: "boolean" },
          host: { type: "string" },
          allowFrom: { type: "array", items: { type: "string" } },
          dmSecurity: { type: "string" },
        },
      },
    },
    setup: agenrenaSetupAdapter,
    setupWizard: agenrenaSetupWizard,
    config: {
      listAccountIds: () => ["default"],
      resolveAccount: (cfg: OpenClawConfig, accountId?: string | null) =>
        resolveAgenrenaAccount(cfg, accountId),
      inspectAccount: (cfg: OpenClawConfig, accountId?: string | null) => {
        const account = resolveAgenrenaAccount(cfg, accountId);
        return {
          enabled: account.enabled,
          configured: account.configured,
          tokenStatus: account.apiKey ? "available" as const : "missing" as const,
        };
      },
      defaultAccountId: () => "default",
      isEnabled: (account) => account.enabled,
      isConfigured: (account) => account.configured,
      unconfiguredReason: () =>
        "Agenrena CLI is not logged in. Run: agenrena auth login",
    },
    messaging: {
      normalizeTarget: (target: string) => {
        const normalized = target.trim();
        return normalized && isAgenrenaChatTarget(normalized) ? normalized : undefined;
      },
      targetResolver: {
        looksLikeId: (id: string) => isAgenrenaChatTarget(id),
        hint: "<source>:<chat_id>",
      },
    },
    directory: createEmptyChannelDirectoryAdapter(),
    gateway: {
      startAccount: async (ctx: {
        cfg: OpenClawConfig;
        accountId: string;
        abortSignal: AbortSignal;
        log?: { info: (msg: string) => void; error: (msg: string) => void };
      }) => {
        const account = resolveAgenrenaAccount(ctx.cfg);
        if (!account.enabled || !account.configured) {
          ctx.log?.info("agenrena: account not configured or disabled, skipping");
          return;
        }
        ctx.log?.info(`agenrena: starting monitor (host: ${account.host})`);
        return monitorAgenrenaProvider({
          account,
          abortSignal: ctx.abortSignal,
          log: ctx.log,
        });
      },
    },
  },
  security: {
    dm: {
      channelKey: CHANNEL_ID,
      resolvePolicy: (account: ResolvedAgenrenaAccount) => account.dmPolicy,
      resolveAllowFrom: (account: ResolvedAgenrenaAccount) => account.allowFrom,
      defaultPolicy: "allowlist",
    },
  },
  pairing: {
    text: {
      idLabel: "agenrenaUserId",
      message: "Your access has been approved.",
      notify: async ({ cfg, id, message }: { cfg: OpenClawConfig; id: string; message: string }) => {
        const account = resolveAgenrenaAccount(cfg);
        if (!account.apiKey) return;
        await sendAgenrenaMessage({
          account,
          target: id,
          text: message,
        });
      },
    },
  },
  threading: { topLevelReplyToMode: "reply" },
  outbound: {
    base: { deliveryMode: "direct" as const },
    attachedResults: {
      channel: CHANNEL_ID,
      sendText: async ({ cfg, to, text, replyToId }: AgenrenaSendTextContext) => {
        const account = resolveAgenrenaAccount(cfg);
        const result = await sendAgenrenaMessage({
          account,
          target: to,
          text,
          replyTo: replyToId,
        });
        return { messageId: result.message_id };
      },
      sendMedia: async ({
        cfg,
        to,
        text,
        mediaUrl,
        replyToId,
        mediaAccess,
        mediaLocalRoots,
        mediaReadFile,
      }: AgenrenaSendMediaContext) => {
        const account = resolveAgenrenaAccount(cfg);
        const result = await sendAgenrenaMediaMessage({
          account,
          target: to,
          mediaUrls: mediaUrl ? [mediaUrl] : [],
          text,
          replyTo: replyToId,
          mediaAccess,
          mediaLocalRoots,
          mediaReadFile,
        });
        return { messageId: result.message_id };
      },
    },
  },
});
