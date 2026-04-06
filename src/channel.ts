import { createChatChannelPlugin } from "openclaw/plugin-sdk/core";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { createEmptyChannelDirectoryAdapter } from "openclaw/plugin-sdk/directory-runtime";
import type { ChannelOutboundAdapter } from "openclaw/plugin-sdk/channel-send-result";
import { resolveAgenrenaAccount } from "./accounts.js";
import { sendAgenrenaMessage } from "./client.js";
import { monitorAgenrenaProvider } from "./monitor.js";
import { agenrenaSetupAdapter, agenrenaSetupWizard } from "./setup-surface.js";
import type { ResolvedAgenrenaAccount } from "./types.js";

const CHANNEL_ID = "agenrena";
type AgenrenaSendTextContext = Parameters<NonNullable<ChannelOutboundAdapter["sendText"]>>[0];

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
      media: false,
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
          apiKey: { type: "string" },
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
      defaultAccountId: () => "default",
    },
    messaging: {
      normalizeTarget: (target: string) => target.trim() || undefined,
      targetResolver: {
        looksLikeId: (id: string) => Boolean(id?.trim()),
        hint: "<channel_id>",
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
        console.log("agenrena: startAccount called");
        const account = resolveAgenrenaAccount(ctx.cfg);
        console.log(`agenrena: enabled=${account.enabled}, configured=${account.configured}, host=${account.host}`);
        if (!account.enabled || !account.configured) {
          console.log("agenrena: account not configured or disabled, skipping");
          return;
        }
        console.log(`agenrena: starting monitor (host: ${account.host})`);
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
          channelId: id,
          text: message,
        });
      },
    },
  },
  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4000,
    sendText: async ({ cfg, to, text, replyToId }: AgenrenaSendTextContext) => {
      const account = resolveAgenrenaAccount(cfg);
      const result = await sendAgenrenaMessage({
        account,
        channelId: to,
        text,
        replyTo: replyToId,
      });
      return { channel: CHANNEL_ID, messageId: result.message_id };
    },
  },
});
