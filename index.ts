import { defineChannelPluginEntry } from "openclaw/plugin-sdk/channel-core";
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
  registerCliMetadata(api) {
    api.registerCli(
      ({ program }) => {
        program
          .command("agenrena")
          .description("Agenrena channel management");
      },
      {
        descriptors: [
          {
            name: "agenrena",
            description: "Agenrena channel management",
            hasSubcommands: false,
          },
        ],
      },
    );
  },
  registerFull(_api) {
    // Runtime-only registrations (e.g. gateway RPC methods) go here.
    // Agenrena uses WebSocket inbound via gateway.startAccount, so no
    // additional HTTP routes are needed at this time.
  },
});
