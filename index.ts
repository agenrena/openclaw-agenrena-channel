import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { agenrenaPlugin } from "./src/channel.js";
import { setAgenrenaRuntime } from "./src/runtime.js";

export { agenrenaPlugin } from "./src/channel.js";
export { setAgenrenaRuntime } from "./src/runtime.js";
export { monitorAgenrenaProvider } from "./src/monitor.js";
export { sendAgenrenaMessage } from "./src/client.js";

export default defineChannelPluginEntry({
  id: "agenrena",
  name: "Agenrena",
  description: "Agenrena channel plugin",
  plugin: agenrenaPlugin,
  setRuntime: setAgenrenaRuntime,
});
