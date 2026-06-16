import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHermesConfigValues,
  isHermesConfigured,
  isOpenClawConfigured,
} from "./configStatus.js";

test("Hermes is configured only when api_base_url exists and is non-empty", () => {
  assert.equal(isHermesConfigured([]), false);
  assert.equal(
    isHermesConfigured([
      { key: "home_dir", value: "C:\\Users\\29987\\.hermes" },
      { key: "api_base_url", value: "   " },
    ]),
    false,
  );
  assert.equal(
    isHermesConfigured([
      { key: "api_base_url", value: "http://127.0.0.1:8642" },
    ]),
    true,
  );
});

test("OpenClaw is configured only when gateway_url exists and is non-empty", () => {
  assert.equal(isOpenClawConfigured([]), false);
  assert.equal(
    isOpenClawConfigured([
      { key: "gateway_token", value: "abc" },
      { key: "gateway_url", value: "" },
    ]),
    false,
  );
  assert.equal(
    isOpenClawConfigured([
      { key: "gateway_url", value: "ws://127.0.0.1:18789" },
    ]),
    true,
  );
});

test("buildHermesConfigValues keeps missing connection fields empty", () => {
  assert.deepEqual(
    buildHermesConfigValues([
      { key: "home_dir", value: "C:\\Users\\29987\\.hermes" },
      { key: "api_base_url", value: "   " },
    ]),
    {
      apiBaseUrl: "",
      apiKey: "",
      dashboardUrl: "",
    },
  );
});

test("buildHermesConfigValues returns configured values when present", () => {
  assert.deepEqual(
    buildHermesConfigValues([
      { key: "api_base_url", value: "http://127.0.0.1:8642" },
      { key: "api_key", value: "secret-token" },
      { key: "dashboard_url", value: "http://127.0.0.1:9119" },
    ]),
    {
      apiBaseUrl: "http://127.0.0.1:8642",
      apiKey: "secret-token",
      dashboardUrl: "http://127.0.0.1:9119",
    },
  );
});
