import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  loadAgenrenaCliCredentials,
  resolveAgenrenaCliCredentialsPath,
} from "../src/cli-credentials.ts";

test("resolves the Agenrena CLI credential path in CLI precedence order", () => {
  assert.equal(
    resolveAgenrenaCliCredentialsPath(
      {
        AGENRENA_CONFIG_DIR: "/custom/agenrena",
        XDG_CONFIG_HOME: "/xdg",
      },
      () => "/home/test",
    ),
    path.join("/custom/agenrena", "credentials.json"),
  );

  assert.equal(
    resolveAgenrenaCliCredentialsPath({ XDG_CONFIG_HOME: "/xdg" }, () => "/home/test"),
    path.join("/xdg", "agenrena", "credentials.json"),
  );

  assert.equal(
    resolveAgenrenaCliCredentialsPath({}, () => "/home/test"),
    path.join("/home/test", ".config", "agenrena", "credentials.json"),
  );
});

test("loads and trims api_key from Agenrena CLI credentials", () => {
  const result = loadAgenrenaCliCredentials({
    env: { AGENRENA_CONFIG_DIR: "/config" },
    readFile: (filePath) => {
      assert.equal(filePath, path.join("/config", "credentials.json"));
      return JSON.stringify({ version: 1, auth_type: "api_key", api_key: "  agr_test  " });
    },
  });

  assert.deepEqual(result, {
    configured: true,
    apiKey: "agr_test",
    credentialsPath: path.join("/config", "credentials.json"),
  });
});

test("reports missing, invalid, and incomplete CLI credentials as unconfigured", () => {
  const cases = [
    {
      readFile: () => {
        throw new Error("missing");
      },
      expectedError: "missing",
    },
    {
      readFile: () => "not-json",
      expectedError: "contain invalid JSON",
    },
    {
      readFile: () => JSON.stringify({ version: 1, auth_type: "api_key" }),
      expectedError: "do not contain api_key",
    },
  ];

  for (const testCase of cases) {
    const result = loadAgenrenaCliCredentials({
      env: { AGENRENA_CONFIG_DIR: "/config" },
      readFile: testCase.readFile,
    });
    assert.equal(result.configured, false);
    assert.match(result.error, new RegExp(testCase.expectedError));
  }
});
