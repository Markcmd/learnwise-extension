import { describe, it, expect } from "vitest";
import {
  normalizeSource,
  validateApiKey,
  normalizeModel,
  buildTranslationMessages,
  buildProviderRequest,
  buildOpenAIRequest,
  parseTranslationContent,
  parseProviderResponse,
  parseOpenAIResponse,
  classifyProviderError,
  classifyOpenAIError,
} from "../JSs/core/translation.js";
import { getProvider, defaultModelFor } from "../JSs/core/providers.js";

describe("normalizeSource", () => {
  it("maps legacy 'api' to 'byok' and unknown to 'local'", () => {
    expect(normalizeSource("api")).toBe("byok");
    expect(normalizeSource("byok")).toBe("byok");
    expect(normalizeSource("managed")).toBe("managed");
    expect(normalizeSource("local")).toBe("local");
    expect(normalizeSource("nonsense")).toBe("local");
    expect(normalizeSource(undefined)).toBe("local");
  });
});

describe("validateApiKey", () => {
  it("accepts a well-formed key (any provider prefix)", () => {
    expect(validateApiKey("sk-" + "a".repeat(40)).valid).toBe(true);
    expect(validateApiKey("sk-ant-" + "a".repeat(40), "anthropic").valid).toBe(true);
  });
  it("rejects empty, spaced, and too-short keys for hosted providers", () => {
    expect(validateApiKey("").valid).toBe(false);
    expect(validateApiKey("sk-abc def").valid).toBe(false);
    expect(validateApiKey("sk-short").valid).toBe(false);
  });
  it("allows an empty key for the custom (local) provider but still rejects spaces", () => {
    expect(validateApiKey("", "custom").valid).toBe(true);
    expect(validateApiKey("has space", "custom").valid).toBe(false);
  });
});

describe("normalizeModel", () => {
  it("keeps supported models, defaults per provider otherwise", () => {
    expect(normalizeModel("gpt-4o", "openai")).toBe("gpt-4o");
    expect(normalizeModel("bogus", "openai")).toBe(defaultModelFor("openai"));
    expect(normalizeModel("bogus", "anthropic")).toBe(defaultModelFor("anthropic"));
    expect(normalizeModel(undefined)).toBe(defaultModelFor("openai"));
  });
  it("accepts any non-empty model for custom", () => {
    expect(normalizeModel("llama3.1", "custom")).toBe("llama3.1");
  });
});

describe("buildProviderRequest — OpenAI shape", () => {
  it("includes lowercased words and an optional context sentence", () => {
    const msgs = buildTranslationMessages(["Cat", "DOG"], { sentence: "The cat sat." });
    expect(msgs[0].role).toBe("system");
    expect(msgs[1].content).toContain('["cat","dog"]');
    expect(msgs[1].content).toContain("The cat sat.");
  });

  it("builds a POST with auth header, json body, default model, and json mode for OpenAI", () => {
    const req = buildProviderRequest({ providerId: "openai", words: ["cat"], apiKey: " sk-xyz ", model: "bogus" });
    expect(req.url).toBe(getProvider("openai").chatUrl);
    expect(req.method).toBe("POST");
    expect(req.headers.Authorization).toBe("Bearer sk-xyz");
    const body = JSON.parse(req.body);
    expect(body.model).toBe(defaultModelFor("openai"));
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("openrouter adds X-Title and omits json mode", () => {
    const req = buildProviderRequest({ providerId: "openrouter", words: ["cat"], apiKey: "sk-or-1", model: "openai/gpt-4o-mini" });
    expect(req.url).toBe(getProvider("openrouter").chatUrl);
    expect(req.headers["X-Title"]).toBe("LearnWise");
    expect(JSON.parse(req.body).response_format).toBeUndefined();
  });

  it("custom resolves the base URL to a chat-completions endpoint", () => {
    const req = buildProviderRequest({
      providerId: "custom",
      words: ["cat"],
      apiKey: "",
      model: "local-model",
      baseUrl: "http://localhost:11434/v1",
    });
    expect(req.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(JSON.parse(req.body).model).toBe("local-model");
  });

  it("back-compat buildOpenAIRequest still targets OpenAI", () => {
    const req = buildOpenAIRequest({ words: ["cat"], apiKey: "sk-xyz" });
    expect(req.url).toBe(getProvider("openai").chatUrl);
  });
});

describe("buildProviderRequest — Anthropic shape", () => {
  it("uses the messages API with x-api-key, version header, and a top-level system field", () => {
    const req = buildProviderRequest({
      providerId: "anthropic",
      words: ["Cat"],
      apiKey: "sk-ant-123",
      model: "claude-3-5-haiku-latest",
      sentence: "The cat sat.",
    });
    expect(req.url).toBe(getProvider("anthropic").chatUrl);
    expect(req.headers["x-api-key"]).toBe("sk-ant-123");
    expect(req.headers["anthropic-version"]).toBeTruthy();
    expect(req.headers.Authorization).toBeUndefined();
    const body = JSON.parse(req.body);
    expect(body.model).toBe("claude-3-5-haiku-latest");
    expect(typeof body.system).toBe("string");
    expect(body.messages[0]).toMatchObject({ role: "user" });
    expect(body.messages[0].content).toContain('["cat"]');
    expect(body.max_tokens).toBeGreaterThan(0);
  });
});

describe("parseProviderResponse", () => {
  it("parses the OpenAI response shape", () => {
    const resp = { choices: [{ message: { content: '{"cat":{"meaning":"猫","pronunciation":"kæt"}}' } }] };
    expect(parseProviderResponse("openai", resp)).toEqual({ cat: { meaning: "猫", pronunciation: "kæt" } });
    expect(parseOpenAIResponse(resp)).toEqual({ cat: { meaning: "猫", pronunciation: "kæt" } });
  });

  it("parses the Anthropic response shape (content[].text)", () => {
    const resp = { content: [{ type: "text", text: '{"dog":{"meaning":"狗","pronunciation":"dɔɡ"}}' }] };
    expect(parseProviderResponse("anthropic", resp)).toEqual({ dog: { meaning: "狗", pronunciation: "dɔɡ" } });
  });

  it("strips code fences and tolerates aliases + string values", () => {
    const fenced = "```json\n{\"dog\":{\"translation\":\"狗\",\"ipa\":\"dɔɡ\"},\"ok\":\"好\"}\n```";
    expect(parseTranslationContent(fenced)).toEqual({
      dog: { meaning: "狗", pronunciation: "dɔɡ" },
      ok: { meaning: "好", pronunciation: "" },
    });
  });

  it("returns {} on junk", () => {
    expect(parseTranslationContent("not json")).toEqual({});
    expect(parseProviderResponse("openai", {})).toEqual({});
  });
});

describe("classifyProviderError", () => {
  it("classifies network, auth, quota, rate limit, server, and unknown", () => {
    expect(classifyProviderError({ networkError: true }).kind).toBe("network");
    expect(classifyProviderError({ status: 401 }).kind).toBe("auth");
    expect(classifyProviderError({ status: 403 }).kind).toBe("auth");
    expect(classifyProviderError({ status: 401 }).retriable).toBe(false);

    const quota = classifyProviderError({ status: 429, body: { error: { code: "insufficient_quota" } } });
    expect(quota.kind).toBe("quota");
    expect(quota.retriable).toBe(false);

    const rl = classifyProviderError({ status: 429, body: { error: { code: "rate_limit_exceeded" } } });
    expect(rl.kind).toBe("rate_limit");
    expect(rl.retriable).toBe(true);

    // Anthropic credit exhaustion arrives as a 400 mentioning credit.
    const credit = classifyProviderError({ status: 400, body: { error: { message: "Your credit balance is too low" } } });
    expect(credit.kind).toBe("quota");

    expect(classifyProviderError({ status: 500 }).kind).toBe("server");
    expect(classifyProviderError({ status: 418 }).kind).toBe("unknown");
    expect(classifyOpenAIError({ status: 401 }).kind).toBe("auth"); // back-compat alias
  });

  it("always allows falling back to local", () => {
    for (const info of [{ networkError: true }, { status: 401 }, { status: 500 }, { status: 418 }]) {
      expect(classifyProviderError(info).fallbackToLocal).toBe(true);
    }
  });
});
