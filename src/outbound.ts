import { createAttachedChannelResultAdapter } from "openclaw/plugin-sdk/channel-send-result";
import { resolveAgenrenaAccount } from "./accounts.js";
import { sendAgenrenaMessage } from "./client.js";

export const agenrenaOutbound = {
  deliveryMode: "direct" as const,
  textChunkLimit: 4000,
  ...createAttachedChannelResultAdapter({
    channel: "agenrena",
    sendText: async ({
      cfg,
      to,
      text,
      replyToId,
    }: {
      cfg: Record<string, unknown>;
      to: string;
      text: string;
      accountId?: string | null;
      replyToId?: string;
    }) => {
      const account = resolveAgenrenaAccount(cfg);
      const result = await sendAgenrenaMessage({
        account,
        channelId: to,
        text,
        replyTo: replyToId,
      });
      return { messageId: result.message_id };
    },
  }),
};
