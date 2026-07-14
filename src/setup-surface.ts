import type { ChannelSetupAdapter } from "openclaw/plugin-sdk/channel-setup";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/routing";
import {
  createTopLevelChannelParsedAllowFromPrompt,
  createTopLevelChannelDmPolicy,
  createStandardChannelSetupStatus,
  mergeAllowFromEntries,
  patchTopLevelChannelConfigSection,
} from "openclaw/plugin-sdk/setup";
import type { ChannelSetupDmPolicy, ChannelSetupWizard } from "openclaw/plugin-sdk/setup";
import { resolveAgenrenaAccount } from "./accounts.js";
import { resolveAgenrenaCliCredentials } from "./cli-credentials.js";

const channel = "agenrena" as const;

const AGENRENA_SETUP_HELP_LINES = [
  "Authentication is managed by the Agenrena CLI.",
  "Run `agenrena auth login` before enabling this channel.",
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
  getCurrent: (cfg) => resolveAgenrenaAccount(cfg).dmPolicy ?? "allowlist",
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
  validateInput: () =>
    resolveAgenrenaCliCredentials().configured
      ? null
      : "Agenrena CLI is not logged in. Run: agenrena auth login",
  applyAccountConfig: ({ cfg }) =>
    patchTopLevelChannelConfigSection({
      cfg,
      channel,
      enabled: true,
      clearFields: ["apiKey"],
      patch: {},
    }),
};

export const agenrenaSetupWizard: ChannelSetupWizard = {
  channel,
  resolveAccountIdForConfigure: () => DEFAULT_ACCOUNT_ID,
  resolveShouldPromptAccountIds: () => false,
  status: createStandardChannelSetupStatus({
    channelLabel: "Agenrena",
    configuredLabel: "CLI login detected",
    unconfiguredLabel: "needs CLI login",
    configuredHint: "configured",
    unconfiguredHint: "run agenrena auth login",
    configuredScore: 1,
    unconfiguredScore: 0,
    includeStatusLine: true,
    resolveConfigured: ({ cfg }) => resolveAgenrenaAccount(cfg).configured,
  }),
  introNote: {
    title: "Agenrena setup",
    lines: AGENRENA_SETUP_HELP_LINES,
  },
  credentials: [],
  dmPolicy: agenrenaDmPolicy,
  disable: (cfg) =>
    patchTopLevelChannelConfigSection({
      cfg,
      channel,
      patch: { enabled: false },
    }),
};
