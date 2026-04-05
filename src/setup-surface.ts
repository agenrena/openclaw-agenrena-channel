import type { ChannelSetupAdapter } from "openclaw/plugin-sdk/channel-setup";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/routing";
import {
  createTopLevelChannelParsedAllowFromPrompt,
  createTopLevelChannelDmPolicy,
  createStandardChannelSetupStatus,
  mergeAllowFromEntries,
  patchTopLevelChannelConfigSection,
} from "openclaw/plugin-sdk/setup";
import type { ChannelSetupDmPolicy, ChannelSetupWizard } from "openclaw/plugin-sdk/setup";
import { formatDocsLink } from "openclaw/plugin-sdk/setup";
import { resolveAgenrenaAccount } from "./accounts.js";

const channel = "agenrena" as const;

const AGENRENA_SETUP_HELP_LINES = [
  "Enter your Agenrena API key to connect.",
  "Env var supported: AGENRENA_API_KEY (default account only).",
];

const promptAgenrenaAllowFrom = createTopLevelChannelParsedAllowFromPrompt({
  channel,
  defaultAccountId: DEFAULT_ACCOUNT_ID,
  noteTitle: "Agenrena allowlist",
  noteLines: ["Allowlist Agenrena users by ID.", "Multiple entries: comma-separated."],
  message: "Agenrena allowFrom",
  placeholder: "user-id-1, user-id-2",
  parseEntries: (raw: string) => {
    const entries = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return { entries };
  },
  mergeEntries: ({ existing, parsed }) => mergeAllowFromEntries(existing, parsed),
});

const agenrenaDmPolicy: ChannelSetupDmPolicy = createTopLevelChannelDmPolicy({
  label: "Agenrena",
  channel,
  policyKey: "channels.agenrena.dmSecurity",
  allowFromKey: "channels.agenrena.allowFrom",
  getCurrent: (cfg) =>
    (cfg.channels as Record<string, { dmSecurity?: string }> | undefined)?.agenrena?.dmSecurity ??
    "allowlist",
  promptAllowFrom: promptAgenrenaAllowFrom,
});

export const agenrenaSetupAdapter: ChannelSetupAdapter = {
  resolveAccountId: () => DEFAULT_ACCOUNT_ID,
  applyAccountName: ({ cfg, name }) =>
    patchTopLevelChannelConfigSection({
      cfg,
      channel,
      patch: name?.trim() ? { name: name.trim() } : {},
    }),
  validateInput: ({ input }) => {
    const typedInput = input as { useEnv?: boolean; apiKey?: string };
    if (!typedInput.useEnv && !typedInput.apiKey?.trim()) {
      return "Agenrena requires --api-key or --use-env.";
    }
    return null;
  },
  applyAccountConfig: ({ cfg, input }) => {
    const typedInput = input as { useEnv?: boolean; apiKey?: string };
    return patchTopLevelChannelConfigSection({
      cfg,
      channel,
      enabled: true,
      clearFields: typedInput.useEnv ? ["apiKey"] : undefined,
      patch: typedInput.useEnv ? {} : { apiKey: typedInput.apiKey?.trim() },
    });
  },
};

export const agenrenaSetupWizard: ChannelSetupWizard = {
  channel,
  resolveAccountIdForConfigure: () => DEFAULT_ACCOUNT_ID,
  resolveShouldPromptAccountIds: () => false,
  status: createStandardChannelSetupStatus({
    channelLabel: "Agenrena",
    configuredLabel: "configured",
    unconfiguredLabel: "needs API key",
    configuredHint: "configured",
    unconfiguredHint: "needs API key",
    configuredScore: 1,
    unconfiguredScore: 0,
    includeStatusLine: true,
    resolveConfigured: ({ cfg }) => resolveAgenrenaAccount(cfg).configured,
  }),
  introNote: {
    title: "Agenrena setup",
    lines: AGENRENA_SETUP_HELP_LINES,
  },
  envShortcut: {
    prompt: "AGENRENA_API_KEY detected. Use env var?",
    preferredEnvVar: "AGENRENA_API_KEY",
    isAvailable: ({ cfg, accountId }) =>
      accountId === DEFAULT_ACCOUNT_ID &&
      Boolean(process.env.AGENRENA_API_KEY?.trim()) &&
      !resolveAgenrenaAccount(cfg).apiKey?.trim(),
    apply: async ({ cfg }) =>
      patchTopLevelChannelConfigSection({
        cfg,
        channel,
        enabled: true,
        clearFields: ["apiKey"],
        patch: {},
      }),
  },
  credentials: [
    {
      inputKey: "apiKey",
      providerHint: channel,
      credentialLabel: "API key",
      preferredEnvVar: "AGENRENA_API_KEY",
      helpTitle: "Agenrena API key",
      helpLines: AGENRENA_SETUP_HELP_LINES,
      envPrompt: "AGENRENA_API_KEY detected. Use env var?",
      keepPrompt: "Agenrena API key already configured. Keep it?",
      inputPrompt: "Agenrena API key",
      allowEnv: ({ accountId }) => accountId === DEFAULT_ACCOUNT_ID,
      inspect: ({ cfg, accountId }) => {
        const account = resolveAgenrenaAccount(cfg, accountId);
        return {
          accountConfigured: account.configured,
          hasConfiguredValue: Boolean(account.apiKey?.trim()),
          resolvedValue: account.apiKey?.trim(),
          envValue: process.env.AGENRENA_API_KEY?.trim(),
        };
      },
      applyUseEnv: async ({ cfg }) =>
        patchTopLevelChannelConfigSection({
          cfg,
          channel,
          enabled: true,
          clearFields: ["apiKey"],
          patch: {},
        }),
      applySet: async ({ cfg, resolvedValue }) =>
        patchTopLevelChannelConfigSection({
          cfg,
          channel,
          enabled: true,
          patch: { apiKey: resolvedValue },
        }),
    },
  ],
  dmPolicy: agenrenaDmPolicy,
  disable: (cfg) =>
    patchTopLevelChannelConfigSection({
      cfg,
      channel,
      patch: { enabled: false },
    }),
};