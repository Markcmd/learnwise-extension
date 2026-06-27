import { describe, it, expect } from "vitest";
import {
  resolveByokConfig,
  getByokConfig,
  getByokSettings,
  saveByokProvider,
} from "../JSs/core/byokSettings.js";
import { STORAGE_KEYS } from "../JSs/core/constants.js";
import { setLocal } from "../JSs/core/storage.js";

describe("resolveByokConfig (pure)", () => {
  it("defaults to OpenAI with no key and the default model", () => {
    const cfg = resolveByokConfig({});
    expect(cfg).toEqual({ providerId: "openai", apiKey: "", model: "gpt-4o-mini", baseUrl: "" });
  });

  it("reads the active provider's key + model from the maps", () => {
    const cfg = resolveByokConfig({
      [STORAGE_KEYS.BYOK_PROVIDER]: "anthropic",
      [STORAGE_KEYS.BYOK_KEYS]: { anthropic: "sk-ant-1", openai: "sk-2" },
      [STORAGE_KEYS.BYOK_MODELS]: { anthropic: "claude-3-5-sonnet-latest" },
    });
    expect(cfg).toEqual({
      providerId: "anthropic",
      apiKey: "sk-ant-1",
      model: "claude-3-5-sonnet-latest",
      baseUrl: "",
    });
  });

  it("migrates the legacy single OpenAI key/model", () => {
    const cfg = resolveByokConfig({
      [STORAGE_KEYS.BYOK_PROVIDER]: "openai",
      [STORAGE_KEYS.OPENAI_KEY]: "sk-legacy-key-1234567890",
      [STORAGE_KEYS.OPENAI_MODEL]: "gpt-4o",
    });
    expect(cfg.apiKey).toBe("sk-legacy-key-1234567890");
    expect(cfg.model).toBe("gpt-4o");
  });

  it("returns the base URL only for the custom provider", () => {
    const cfg = resolveByokConfig({
      [STORAGE_KEYS.BYOK_PROVIDER]: "custom",
      [STORAGE_KEYS.BYOK_KEYS]: { custom: "" },
      [STORAGE_KEYS.BYOK_MODELS]: { custom: "local-model" },
      [STORAGE_KEYS.BYOK_BASE_URL]: "http://localhost:11434/v1",
    });
    expect(cfg).toEqual({
      providerId: "custom",
      apiKey: "",
      model: "local-model",
      baseUrl: "http://localhost:11434/v1",
    });
  });
});

describe("byokSettings IO round-trip", () => {
  it("saves a provider's key/model and reads them back", async () => {
    await saveByokProvider({ provider: "anthropic", key: "sk-ant-xyz", model: "claude-3-5-haiku-latest" });
    const settings = await getByokSettings();
    expect(settings.provider).toBe("anthropic");
    expect(settings.keys.anthropic).toBe("sk-ant-xyz");
    expect(settings.models.anthropic).toBe("claude-3-5-haiku-latest");

    const cfg = await getByokConfig();
    expect(cfg).toMatchObject({ providerId: "anthropic", apiKey: "sk-ant-xyz" });
  });

  it("keeps each provider's key when switching providers", async () => {
    await saveByokProvider({ provider: "openai", key: "sk-openai-1234567890", model: "gpt-4o" });
    await saveByokProvider({ provider: "openrouter", key: "sk-or-1234567890", model: "openai/gpt-4o-mini" });
    const settings = await getByokSettings();
    // Both keys preserved across the switch.
    expect(settings.keys.openai).toBe("sk-openai-1234567890");
    expect(settings.keys.openrouter).toBe("sk-or-1234567890");
    expect(settings.provider).toBe("openrouter");
  });

  it("persists a base URL for the custom provider", async () => {
    await saveByokProvider({ provider: "custom", key: "", model: "m", baseUrl: "http://localhost:1234/v1" });
    const cfg = await getByokConfig();
    expect(cfg.baseUrl).toBe("http://localhost:1234/v1");
  });

  it("surfaces a legacy OpenAI key in getByokSettings", async () => {
    await setLocal({ [STORAGE_KEYS.OPENAI_KEY]: "sk-legacy-1234567890" });
    const settings = await getByokSettings();
    expect(settings.keys.openai).toBe("sk-legacy-1234567890");
  });
});
