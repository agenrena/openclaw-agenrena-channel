import type { DmPolicy } from "openclaw/plugin-sdk/setup";

export type AgenrenaMessageType = "text" | "image";
export type AgenrenaTextFormat = "plain" | "markdown";

/** Agenrena plugin configuration stored in openclaw config. */
export type AgenrenaConfig = {
  enabled?: boolean;
  apiKey?: string;
  host?: string;
  allowFrom?: string[];
  dmSecurity?: DmPolicy;
};

/** Resolved account after reading config. */
export type ResolvedAgenrenaAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  apiKey?: string;
  host: string;
  allowFrom: string[];
  dmPolicy?: DmPolicy;
};

/** Image attachment from Agenrena. */
export type AgenrenaImage = {
  id: string;
  url: string;
  width: number;
  height: number;
  mime_type: string;
  sort_order: number;
};

/** Inbound WebSocket message from Agenrena. */
export type AgenrenaWsEvent = {
  id: string;
  conversation_id: string;
  message_type?: AgenrenaMessageType;
  text_format?: AgenrenaTextFormat;
  context?: unknown | null;
  sender: {
    type: string;
    id: string;
    display_name?: string;
    name?: string;
  };
  text?: string;
  images: AgenrenaImage[];
  reply_to_id?: string | null;
  created_at: string;
};

/** Result from sending a message via REST API. */
export type AgenrenaSendResult = {
  message_id: string;
};
