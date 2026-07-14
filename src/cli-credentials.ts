import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const CREDENTIALS_FILE_NAME = "credentials.json";

type CredentialLoaderOptions = {
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
  readFile?: (filePath: string) => string;
};

export type AgenrenaCliCredentialResolution =
  | {
      configured: true;
      apiKey: string;
      credentialsPath: string;
    }
  | {
      configured: false;
      credentialsPath: string;
      error: string;
    };

let cachedCredentials: AgenrenaCliCredentialResolution | undefined;

/** Resolve the credential path using the same precedence as the Agenrena CLI. */
export function resolveAgenrenaCliCredentialsPath(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const configuredDir = env.AGENRENA_CONFIG_DIR?.trim();
  if (configuredDir) {
    return path.join(configuredDir, CREDENTIALS_FILE_NAME);
  }

  const xdgConfigHome = env.XDG_CONFIG_HOME?.trim();
  if (xdgConfigHome) {
    return path.join(xdgConfigHome, "agenrena", CREDENTIALS_FILE_NAME);
  }

  return path.join(homedir(), ".config", "agenrena", CREDENTIALS_FILE_NAME);
}

/** Read Agenrena CLI-owned credentials without copying them into OpenClaw config. */
export function loadAgenrenaCliCredentials(
  options: CredentialLoaderOptions = {},
): AgenrenaCliCredentialResolution {
  const env = options.env ?? process.env;
  const credentialsPath = resolveAgenrenaCliCredentialsPath(
    env,
    options.homedir ?? os.homedir,
  );

  let raw: string;
  try {
    raw = options.readFile
      ? options.readFile(credentialsPath)
      : readFileSync(credentialsPath, "utf8");
  } catch (error) {
    return {
      configured: false,
      credentialsPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {
      configured: false,
      credentialsPath,
      error: `Agenrena CLI credentials at ${credentialsPath} contain invalid JSON.`,
    };
  }

  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      configured: false,
      credentialsPath,
      error: `Agenrena CLI credentials at ${credentialsPath} must contain a JSON object.`,
    };
  }

  const apiKey = (parsed as Record<string, unknown>).api_key;
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    return {
      configured: false,
      credentialsPath,
      error: `Agenrena CLI credentials at ${credentialsPath} do not contain api_key.`,
    };
  }

  return {
    configured: true,
    apiKey: apiKey.trim(),
    credentialsPath,
  };
}

/** CLI login state is process-stable; restart the Gateway to reload it. */
export function resolveAgenrenaCliCredentials(): AgenrenaCliCredentialResolution {
  cachedCredentials ??= loadAgenrenaCliCredentials();
  return cachedCredentials;
}
