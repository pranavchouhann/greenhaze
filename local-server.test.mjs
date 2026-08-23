import test from "node:test";
import assert from "node:assert/strict";
import { defaultConfig, hashPassword, verifyPassword } from "./local-server.mjs";

test("local password storage verifies the original password and rejects another one", () => {
  const stored = hashPassword("plant-care-password", "local-test-salt");
  assert.equal(verifyPassword("plant-care-password", stored), true);
  assert.equal(verifyPassword("wrong-password", stored), false);
  assert.equal(stored.includes("plant-care-password"), false);
});

test("localhost project ships with a local-only default configuration", () => {
  assert.equal(defaultConfig.port, 3000);
  assert.equal(defaultConfig.adminPassword, "");
  assert.equal(defaultConfig.aiApiKey, "");
  assert.match(defaultConfig.aiApiUrl, /^https:\/\//);
});
