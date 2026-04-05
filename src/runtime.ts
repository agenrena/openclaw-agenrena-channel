import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";

const { setRuntime: setAgenrenaRuntime, getRuntime: getAgenrenaRuntime } =
  createPluginRuntimeStore<PluginRuntime>(
    "Agenrena runtime not initialized - plugin not registered",
  );

export { getAgenrenaRuntime, setAgenrenaRuntime };
