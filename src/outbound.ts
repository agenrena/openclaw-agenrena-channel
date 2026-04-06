import {
  createAttachedChannelResultAdapter,
  type ChannelOutboundAdapter,
} from "openclaw/plugin-sdk/channel-send-result";
import { resolveAgenrenaAccount } from "./accounts.js";
import { sendAgenrenaMessage } from "./client.js";

type AgenrenaSendTextContext = Parameters<NonNullable<ChannelOutboundAdapter["sendText"]>>[0];

export const agenrenaOutbound = {
  deliveryMode: "direct" as const,
  textChunkLimit: 4000,
  ...createAttachedChannelResultAdapter({
    channel: "agenrena",
    sendText: async ({ cfg, to, text, replyToId }: AgenrenaSendTextContext) => {
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
