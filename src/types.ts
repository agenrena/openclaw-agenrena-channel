/** Agenrena plugin configuration stored in openclaw config. */
export type AgenrenaConfig = {
  enabled?: boolean;
  apiKey?: string;
  host?: string;
  allowFrom?: string[];
  dmSecurity?: string;
};

/** Resolved account after reading config. */
export type ResolvedAgenrenaAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  apiKey?: string;
  host: string;
  allowFrom: string[];
  dmPolicy?: string;
};

/** Inbound WebSocket message from Agenrena. */
export type AgenrenaWsEvent = {
  id: string;
  conversation_id: string;
  sender: {
    type: string;
    id: string;
    display_name?: string;
    name?: string;
  };
  text: string;
  reply_to_id?: string | null;
  created_at: string;
};

/** Result from sending a message via REST API. */
export type AgenrenaSendResult = {
  message_id: string;
};
