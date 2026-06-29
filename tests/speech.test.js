// =====================================================================
// M2.3 — speech: pure voice-selection logic.
// =====================================================================
import { describe, it, expect } from "vitest";
import { pickEnglishVoice } from "../JSs/dom/speech.js";

const V = (lang, def = false, name = lang) => ({ lang, default: def, name });

describe("speech — pickEnglishVoice", () => {
  it("prefers an exact language match", () => {
    const voices = [V("en-GB"), V("en-US"), V("fr-FR", true)];
    expect(pickEnglishVoice(voices, "en-US").lang).toBe("en-US");
  });

  it("is case-insensitive on lang", () => {
    const voices = [V("EN-us"), V("fr-FR")];
    expect(pickEnglishVoice(voices, "en-US").lang).toBe("EN-us");
  });

  it("falls back to any English voice when the exact lang is absent", () => {
    const voices = [V("fr-FR", true), V("en-AU")];
    expect(pickEnglishVoice(voices, "en-US").lang).toBe("en-AU");
  });

  it("falls back to the platform default, then the first voice", () => {
    expect(pickEnglishVoice([V("fr-FR"), V("de-DE", true)], "en-US").lang).toBe("de-DE");
    expect(pickEnglishVoice([V("fr-FR"), V("de-DE")], "en-US").lang).toBe("fr-FR");
  });

  it("returns null for an empty or invalid list", () => {
    expect(pickEnglishVoice([], "en-US")).toBeNull();
    expect(pickEnglishVoice(null, "en-US")).toBeNull();
    expect(pickEnglishVoice([{}, { name: "x" }], "en-US")).toBeNull(); // no lang fields
  });
});
