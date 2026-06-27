import { describe, it, expect } from "vitest";
import {
  PROVIDER_IDS,
  getProvider,
  normalizeProvider,
  isOpenAiShape,
  defaultModelFor,
  resolveChatUrl,
  originPatternFromUrl,
} from "../JSs/core/providers.js";

describe("providers registry", () => {
  it("exposes the expected providers", () => {
    expect(PROVIDER_IDS).toEqual(["openai", "anthropic", "openrouter", "custom"]);
  });

  it("normalizes unknown ids to the default", () => {
    expect(normalizeProvider("openai")).toBe("openai");
    expect(normalizeProvider("anthropic")).toBe("anthropic");
    expect(normalizeProvider("nope")).toBe("openai");
    expect(normalizeProvider(undefined)).toBe("openai");
  });

  it("knows which providers use the OpenAI shape", () => {
    expect(isOpenAiShape("openai")).toBe(true);
    expect(isOpenAiShape("openrouter")).toBe(true);
    expect(isOpenAiShape("custom")).toBe(true);
    expect(isOpenAiShape("anthropic")).toBe(false);
  });

  it("gives a default model per provider ('' for custom)", () => {
    expect(defaultModelFor("openai")).toBe("gpt-4o-mini");
    expect(defaultModelFor("anthropic")).toBe("claude-3-5-haiku-latest");
    expect(defaultModelFor("custom")).toBe("");
  });

  it("resolves preset chat URLs and custom base URLs", () => {
    expect(resolveChatUrl("openai")).toBe(getProvider("openai").chatUrl);
    expect(resolveChatUrl("custom", "http://localhost:11434/v1")).toBe(
      "http://localhost:11434/v1/chat/completions"
    );
    expect(resolveChatUrl("custom", "http://localhost:11434/v1/chat/completions")).toBe(
      "http://localhost:11434/v1/chat/completions"
    );
    expect(resolveChatUrl("custom", "https://my.host/")).toBe("https://my.host/v1/chat/completions");
    expect(resolveChatUrl("custom", "")).toBe("");
  });

  it("derives an origin pattern for chrome.permissions", () => {
    expect(originPatternFromUrl("http://localhost:11434/v1")).toBe("http://localhost:11434/*");
    expect(originPatternFromUrl("https://api.example.com/v1/chat")).toBe("https://api.example.com/*");
    expect(originPatternFromUrl("junk")).toBe("");
  });
});
