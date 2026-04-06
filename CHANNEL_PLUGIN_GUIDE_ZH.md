# OpenClaw Channel Plugin 開發整理

這份文件整理自 OpenClaw 官方的 Channel Plugin 與 Plugin 開發文件，目標不是逐字翻譯，而是用比較實作導向的方式，幫助我們用比較正規的方式開發像 `Agenrena` 這種聊天平台插件。

參考文件：

- https://docs.openclaw.ai/plugins/sdk-channel-plugins
- https://docs.openclaw.ai/plugins/building-plugins
- https://docs.openclaw.ai/plugins/sdk-overview

## 1. Channel Plugin 是做什麼的

OpenClaw 的 channel plugin 用來把 OpenClaw 接到一個聊天平台上，例如 Discord、IRC、Slack，或我們現在的 Agenrena。

Channel plugin 不需要自己做一套獨立的 `message` tool。OpenClaw core 已經有共用的訊息工具，channel plugin 主要負責平台特有的部分：

- Config：帳號解析、設定欄位、setup wizard
- Security：DM policy、allowlist
- Pairing：新私訊對象的核准流程
- Session grammar：平台 conversation id、thread id、parent fallback 怎麼映射到 OpenClaw session
- Outbound：送文字、媒體、投票到平台
- Inbound pipeline：把平台事件轉成 OpenClaw 可處理的 inbound context
- Threading：回覆怎麼掛線

## 2. 官方推薦的開發方式

如果是新開發的 channel plugin，優先用官方提供的 builder 與 entry API：

- `defineChannelPluginEntry(...)`
- `defineSetupPluginEntry(...)`
- `createChatChannelPlugin(...)`

這樣做的好處是：

- 比較符合 OpenClaw 現在的 SDK 設計
- 型別比較完整
- 很多常見能力會自動接好
- 後面 SDK 更新時比較容易跟上

## 3. 建議的專案結構

一個比較正規的 channel plugin，建議最少有這些檔案：

```text
openclaw-agenrena-plugin/
├── package.json
├── openclaw.plugin.json
├── tsconfig.json
├── index.ts
├── setup-entry.ts
└── src/
    ├── channel.ts
    ├── accounts.ts
    ├── setup-surface.ts
    ├── client.ts
    ├── monitor.ts
    ├── inbound-context.ts
    ├── runtime.ts
    ├── session-key.ts
    ├── types.ts
    └── channel.test.ts
```

每個檔案的責任建議如下：

- `index.ts`
  正式 plugin entry，註冊完整 channel plugin
- `setup-entry.ts`
  setup 專用 entry，給 onboarding 或未配置時使用
- `src/channel.ts`
  組裝 channel plugin，不放太多平台細節
- `src/accounts.ts`
  config 解析、account resolve、enabled/configured 判斷
- `src/setup-surface.ts`
  setup adapter、setup wizard、DM policy 與 allowlist 配置
- `src/client.ts`
  Agenrena 的 HTTP / WebSocket client
- `src/monitor.ts`
  監聽 inbound event，轉送給 OpenClaw reply pipeline
- `src/inbound-context.ts`
  把 Agenrena 的事件映射成 OpenClaw inbound context
- `src/runtime.ts`
  runtime store
- `src/session-key.ts`
  session key 與 conversation grammar 相關邏輯
- `src/channel.test.ts`
  基本型別與行為測試

## 4. package.json 與 manifest

官方要求每個插件都需要 manifest。對 channel plugin 來說，最基本會包含：

- `package.json`
- `openclaw.plugin.json`

### `package.json` 的重點

- `type` 應該是 `module`
- `openclaw.extensions` 指向 `index.ts`
- `openclaw.setupEntry` 指向 `setup-entry.ts`
- `openclaw.channel` 需提供 `id`、`label`、`blurb`
- `openclaw` 通常放在 `peerDependencies`

範例方向：

```json
{
  "name": "@your-org/openclaw-agenrena",
  "version": "1.0.0",
  "type": "module",
  "peerDependencies": {
    "openclaw": ">=2026.x"
  },
  "openclaw": {
    "extensions": ["./index.ts"],
    "setupEntry": "./setup-entry.ts",
    "channel": {
      "id": "agenrena",
      "label": "Agenrena",
      "blurb": "Connect OpenClaw to Agenrena."
    }
  }
}
```

### `openclaw.plugin.json` 的重點

這份 manifest 不只是形式上的存在，它實際上應該負責：

- plugin id
- channel id
- config schema
- setup / runtime 還沒完整啟動時可讀取的靜態 metadata

建議 `openclaw.plugin.json` 的 schema 要和 runtime 解析邏輯同步，不要一邊有 `host`、`enabled`，另一邊 schema 卻沒宣告。

## 5. Entry Point 怎麼分

### `index.ts`

`index.ts` 應使用 `defineChannelPluginEntry(...)`。

它的責任通常是：

- 註冊 plugin id、名稱、描述
- 指定 `plugin`
- 必要時透過 `setRuntime` 注入 runtime store
- 需要時用 `registerFull(...)` 註冊 HTTP route、gateway method、CLI 相關完整能力

### `setup-entry.ts`

`setup-entry.ts` 應使用 `defineSetupPluginEntry(...)`。

它的目的不是重複，而是讓 OpenClaw 在 setup 流程、尚未配置或停用插件時，可以用比較輕量的方式載入 plugin。

對像 Agenrena 這種會有 WebSocket、monitor、runtime store 的插件，這個分離很重要。

## 6. `channel.ts` 應該只做組裝

`src/channel.ts` 應該專注於組裝 `createChatChannelPlugin(...)`，而不是塞滿平台實作細節。

建議放在 `channel.ts` 的東西：

- `meta`
- `capabilities`
- `reload`
- `configSchema`
- `setup`
- `security`
- `pairing`
- `messaging`
- `gateway`
- `outbound`

不建議直接塞在 `channel.ts` 的東西：

- HTTP request 細節
- WebSocket 事件解析
- 大量 session key 細節
- inbound event mapping
- 複雜 config patch 細節

這些應該回到 `client.ts`、`monitor.ts`、`inbound-context.ts`、`setup-surface.ts`、`accounts.ts`。

## 7. `createChatChannelPlugin(...)` 能幫我們接什麼

官方推薦的新 channel plugin 主要用 `createChatChannelPlugin(...)` 來組。

常用能力如下：

- `security.dm`
  處理誰可以私訊 bot
- `pairing.text`
  處理配對或核准通知
- `threading`
  處理 reply mode 與 thread 相關行為
- `outbound.attachedResults`
  把送訊息結果包裝成 OpenClaw 期待的格式

對大部分 direct-message channel 來說，這種 declarative 寫法比手拼底層 adapter 更穩定。

## 8. Setup Wizard 的實作原則

這是最容易踩型別坑的一塊。

官方現在的 setup wizard 有固定的 `ChannelSetupInput` 欄位集合，所以：

- 優先使用既有欄位，例如 `token`、`password`、`privateKey`、`url`
- 不要隨便新增 wizard 自己專用的 `inputKey`

如果平台本身叫 API key，也建議：

- wizard 輸入層用 OpenClaw 既有欄位，例如 `token`
- 寫回 config 時，再轉成 `channels.agenrena.apiKey`

這樣能同時滿足：

- SDK 型別要求
- wizard 相容性
- 你自己的 config 命名需求

## 9. DM Security 與 Pairing

官方示範中，channel plugin 會很自然地包含：

- `security.dm`
- `pairing.text`

常見模式是：

- `security.dm`
  用 `dmPolicy` 與 `allowFrom` 決定誰可以傳訊息給 bot
- `pairing.text`
  用一段文字通知使用者已通過核准，或提供驗證碼

如果平台本身已經能穩定識別 DM 對象，就盡量把這層做成純配置加純通知，不要在 pairing 裡塞過多平台邏輯。

## 10. Session Grammar 是 channel plugin 的核心之一

官方文件很特別地把這塊拉出來講，代表它很重要。

如果平台的 conversation id 不是單純一個 chat id，而是會夾帶：

- thread id
- parent conversation
- base conversation

那這些解析應該放在 plugin 內，而不是丟給 core 猜。

官方推薦的 canonical hook 是：

- `messaging.resolveSessionConversation(...)`

這個 hook 應該負責把平台原始 id 解析成：

- base conversation id
- 可選 thread id
- 可選 baseConversationId
- `parentConversationCandidates`

如果要提供 `parentConversationCandidates`，排序應該從最窄到最寬。

目前 Agenrena 插件如果只有 direct conversation，這塊可以先維持簡單。但若未來 Agenrena 有 thread 或 reply chain，這會是正式擴充點。

## 11. Inbound handling 是 plugin 自己的責任

官方明確說，入站訊息處理是 channel-specific 的。

意思是：

- 每個 channel plugin 都要自己接平台事件
- 自己驗證 request 或 WebSocket event
- 自己把事件轉成 OpenClaw inbound context
- 再交給 OpenClaw 的 reply pipeline

對 Agenrena 這種 WebSocket 平台來說，比較合理的拆法是：

- `client.ts`
  建立 WebSocket 與 REST client
- `monitor.ts`
  監聽訊息事件
- `inbound-context.ts`
  把事件映射成 OpenClaw 的 context

## 12. Outbound 建議優先用 `attachedResults`

官方範例裡，`outbound` 推薦優先走：

```ts
outbound: {
  attachedResults: {
    sendText: async (params) => {
      return { messageId: result.id };
    },
  },
}
```

這樣的優點是：

- 我們只需要回傳平台真正的結果
- `channel` 等包裝可由 helper 接手
- 比較不容易踩 `OutboundDeliveryResult` 型別坑

如果直接寫低層 `sendText` adapter，也不是不行，但就要自己完整回傳 `channel` 等欄位。

## 13. Approval 大多不需要自己重做

官方特別提到，大部分 channel plugin 不需要自己做 approval-specific code。

原因是 OpenClaw core 已經處理：

- same-chat `/approve`
- 共用 approval button payload
- fallback delivery

只有當平台真的需要 native approval routing 或特別的 approval UI，才需要使用 `approvalCapability`。

對一般聊天平台插件來說，先走預設路徑會比較穩。

## 14. Import 慣例

官方現在很強調 import 要走精準 subpath，不要依賴過大的 umbrella import。

建議：

```ts
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { defineSetupPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
```

不建議：

```ts
import { ... } from "openclaw/plugin-sdk";
```

另外，channel 相關 helper 應盡量往這些比較窄的 surface 靠：

- `openclaw/plugin-sdk/channel-core`
- `openclaw/plugin-sdk/channel-setup`
- `openclaw/plugin-sdk/setup-runtime`
- `openclaw/plugin-sdk/reply-runtime`
- `openclaw/plugin-sdk/inbound-envelope`
- `openclaw/plugin-sdk/inbound-reply-dispatch`
- `openclaw/plugin-sdk/runtime-store`

## 15. 測試建議

官方範例建議寫 colocated test，例如 `src/channel.test.ts`。

對 Agenrena 插件，最值得先補的測試有：

- `resolveAgenrenaAccount(...)` 在有 / 沒有 config 時的結果
- `configured` / `enabled` / `host` / `dmPolicy` 的解析
- setup wizard 對 `token` 或 env var 的處理
- outbound `sendText` 的回傳 shape
- monitor 收到 event 後是否能組出正確 inbound message

一開始不需要追求超完整整合測試，先把 config、typing、mapping 這幾層測起來，價值最高。

## 16. 對 Agenrena 插件的實作建議

如果以目前這個插件為基礎，要往更正規的結構靠，建議順序如下：

1. 讓 `index.ts`、`setup-entry.ts` 完全對齊官方 entry pattern
2. 把 `channel.ts` 保持成純 wiring 層
3. 統一 manifest schema、runtime schema、account type
4. setup wizard 一律使用 OpenClaw 既有 `ChannelSetupInput` 鍵
5. outbound 優先用 `attachedResults`
6. 把 import 往更精準的 subpath 收斂
7. 補 `channel.test.ts`
8. 最後再處理 Agenrena 平台本身的 API / WebSocket 行為驗證

## 17. 最短版結論

如果只記一句話：

OpenClaw 官方目前推薦的 channel plugin 寫法，是把 plugin 拆成 entry、setup entry、channel object、config/setup、platform client、monitor、runtime 幾層，並透過 `defineChannelPluginEntry(...)`、`defineSetupPluginEntry(...)`、`createChatChannelPlugin(...)` 來組裝，平台特有行為留在 plugin，通用訊息工具與大部分 approval 流程交給 core。
