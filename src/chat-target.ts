const CHAT_TARGET_SEPARATOR = ":";
const SOURCE_PATTERN = /^[a-zA-Z0-9_-]+$/;

export type AgenrenaChatRoute = {
  source: string;
  chatId: string;
};

export type AgenrenaHubRouteFields = {
  source: string;
  chat_id: string;
};

/** Preserve the Agenrena hub route inside an OpenClaw channel target. */
export function composeAgenrenaChatTarget(route: AgenrenaChatRoute): string {
  const source = route.source.trim();
  const chatId = route.chatId.trim();
  if (!SOURCE_PATTERN.test(source)) {
    throw new Error(`Invalid Agenrena source: ${JSON.stringify(route.source)}`);
  }
  if (!chatId) {
    throw new Error("Invalid Agenrena chat_id: value is empty");
  }
  return `${source}${CHAT_TARGET_SEPARATOR}${chatId}`;
}

/** Split an OpenClaw target back into the Agenrena hub routing fields. */
export function parseAgenrenaChatTarget(target: string): AgenrenaChatRoute {
  const normalized = target.trim();
  const separatorIndex = normalized.indexOf(CHAT_TARGET_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) {
    throw new Error(
      `Invalid Agenrena target ${JSON.stringify(target)}; expected <source>:<chat_id>`,
    );
  }
  const source = normalized.slice(0, separatorIndex);
  if (!SOURCE_PATTERN.test(source)) {
    throw new Error(`Invalid Agenrena source: ${JSON.stringify(source)}`);
  }
  return {
    source,
    chatId: normalized.slice(separatorIndex + 1),
  };
}

export function isAgenrenaChatTarget(target: string): boolean {
  try {
    parseAgenrenaChatTarget(target);
    return true;
  } catch {
    return false;
  }
}

export function buildAgenrenaHubRouteFields(target: string): AgenrenaHubRouteFields {
  const route = parseAgenrenaChatTarget(target);
  return { source: route.source, chat_id: route.chatId };
}
