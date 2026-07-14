import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgenrenaHubRouteFields,
  composeAgenrenaChatTarget,
  isAgenrenaChatTarget,
  parseAgenrenaChatTarget,
} from "../src/chat-target.ts";

test("composes and parses a source-qualified Agenrena chat target", () => {
  const target = composeAgenrenaChatTarget({ source: "agenrena", chatId: "room:123" });
  assert.equal(target, "agenrena:room:123");
  assert.deepEqual(parseAgenrenaChatTarget(target), {
    source: "agenrena",
    chatId: "room:123",
  });
});

test("builds the exact hub source/chat_id request fields", () => {
  assert.deepEqual(buildAgenrenaHubRouteFields("fitclub:room:123"), {
    source: "fitclub",
    chat_id: "room:123",
  });
});

test("rejects targets that do not contain both source and chat_id", () => {
  for (const target of ["", "agenrena", ":room", "agenrena:"]) {
    assert.equal(isAgenrenaChatTarget(target), false);
    assert.throws(() => parseAgenrenaChatTarget(target), /expected <source>:<chat_id>/);
  }
});

test("rejects an invalid source when composing a target", () => {
  for (const source of ["bad:source", "bad source"]) {
    assert.throws(
      () => composeAgenrenaChatTarget({ source, chatId: "room" }),
      /Invalid Agenrena source/,
    );
  }
  assert.equal(isAgenrenaChatTarget("bad source:room"), false);
});
