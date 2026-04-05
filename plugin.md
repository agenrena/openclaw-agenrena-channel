建立頻道插件
本指南將逐步介紹如何建立一個連接 OpenClaw 和即時通訊平台的頻道外掛程式。完成本指南後，您將擁有一個具備私訊安全性、配對、回覆線程和對外訊息功能的可用頻道。
如果您之前沒有建立過任何 OpenClaw 插件，請先閱讀「 入門指南」以了解基本的套件結構和清單設定。
號
頻道插件的工作原理
頻道插件不需要自己的發送/編輯/回應工具。 OpenClawmessage核心中保留了一個共享工具。您的外掛擁有：
配置— 帳戶解析與設定精靈
安全性— DM 策略和允許列表
配對— DM 審批流程
對外發送－向平台發送文字、媒體和投票
回覆順序－回覆如何依序排列
Core 擁有共享訊息工具、提示佈線、會話簿記和調度功能。
號
攻略
1
包裝和清單

建立標準插件檔案。channel其中的欄位package.json決定了它是否為頻道插件：

package.json

openclaw.plugin.json
{
"name": "@myorg/openclaw-acme-chat",
"version": "1.0.0",
"type": "module",
"openclaw": {
"extensions": ["./index.ts"],
"setupEntry": "./setup-entry.ts",
"channel": {
"id": "acme-chat",
"label": "Acme Chat",
"blurb": "Connect OpenClaw to Acme Chat."
}
}
}
2
建構通道插件對象

此ChannelPlugin介面提供多種可選的適配器介面。建議從最基本的適配器介面開始id，setup然後根據需要添加其他適配器。
創造src/channel.ts：
src/channel.ts
import {
createChatChannelPlugin,
createChannelPluginBase,
} from "openclaw/plugin-sdk/core";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { acmeChatApi } from "./client.js"; // your platform API client

type ResolvedAccount = {
accountId: string | null;
token: string;
allowFrom: string[];
dmPolicy: string | undefined;
};

function resolveAccount(
cfg: OpenClawConfig,
accountId?: string | null,
): ResolvedAccount {
const section = (cfg.channels as Record<string, any>)?.["acme-chat"];
const token = section?.token;
if (!token) throw new Error("acme-chat: token is required");
return {
accountId: accountId ?? null,
token,
allowFrom: section?.allowFrom ?? [],
dmPolicy: section?.dmSecurity,
};
}

export const acmeChatPlugin = createChatChannelPlugin<ResolvedAccount>({
base: createChannelPluginBase({
id: "acme-chat",
setup: {
resolveAccount,
inspectAccount(cfg, accountId) {
const section =
(cfg.channels as Record<string, any>)?.["acme-chat"];
return {
enabled: Boolean(section?.token),
configured: Boolean(section?.token),
tokenStatus: section?.token ? "available" : "missing",
};
},
},
}),

// DM security: who can message the bot
security: {
dm: {
channelKey: "acme-chat",
resolvePolicy: (account) => account.dmPolicy,
resolveAllowFrom: (account) => account.allowFrom,
defaultPolicy: "allowlist",
},
},

// Pairing: approval flow for new DM contacts
pairing: {
text: {
idLabel: "Acme Chat username",
message: "Send this code to verify your identity:",
notify: async ({ target, code }) => {
await acmeChatApi.sendDm(target, `Pairing code: ${code}`);
},
},
},

// Threading: how replies are delivered
threading: { topLevelReplyToMode: "reply" },

// Outbound: send messages to the platform
outbound: {
attachedResults: {
sendText: async (params) => {
const result = await acmeChatApi.sendMessage(
params.to,
params.text,
);
return { messageId: result.id };
},
},
base: {
sendMedia: async (params) => {
await acmeChatApi.sendFile(params.to, params.filePath);
},
},
},
});
createChatChannelPlugin 能為您做什麼？

3
連接入口點

創造index.ts：
index.ts
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { acmeChatPlugin } from "./src/channel.js";

export default defineChannelPluginEntry({
id: "acme-chat",
name: "Acme Chat",
description: "Acme Chat channel plugin",
plugin: acmeChatPlugin,
registerFull(api) {
api.registerCli(
({ program }) => {
program
.command("acme-chat")
.description("Acme Chat management");
},
{ commands: ["acme-chat"] },
);
},
});
defineChannelPluginEntry自動處理設定/完整註冊流程。 有關所有選項，請參閱“入口點” 。
4
新增設定條目

建立setup-entry.ts輕量級載入模式，方便使用者在新使用者註冊期間使用：
setup-entry.ts
import { defineSetupPluginEntry } from "openclaw/plugin-sdk/core";
import { acmeChatPlugin } from "./src/channel.js";

export default defineSetupPluginEntry(acmeChatPlugin);
當頻道停用或未配置時，OpenClaw 會載入此條目而不是完整條目。這樣可以避免在設定流程中引入大量運行時程式碼。詳情請參閱“設定和配置”部分。
5
處理入站訊息

您的插件需要接收來自平台的訊息並將其轉發給 OpenClaw。典型的模式是使用 webhook 來驗證請求，並透過您通道的入站處理程序分發請求：
registerFull(api) {
api.registerHttpRoute({
path: "/acme-chat/webhook",
auth: "plugin", // plugin-managed auth (verify signatures yourself)
handler: async (req, res) => {
const event = parseWebhookPayload(req);

      // Your inbound handler dispatches the message to OpenClaw.
      // The exact wiring depends on your platform SDK —
      // see a real example in extensions/msteams or extensions/googlechat.
      await handleAcmeChatInbound(api, event);

      res.statusCode = 200;
      res.end("ok");
      return true;
    },

});
}
入站訊息處理是頻道特有的。每個通道插件都有自己的入站管道。可以參考捆綁的通道插件（例如extensions/msteams，extensions/googlechat）來了解實際模式。
