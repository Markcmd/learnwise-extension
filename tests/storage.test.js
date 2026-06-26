import { describe, it, expect } from "vitest";
import { getLocal, setLocal, removeLocal } from "../JSs/core/storage.js";

describe("storage wrapper", () => {
  it("round-trips values through the fake chrome.storage.local", async () => {
    await setLocal({ a: 1, b: "two" });
    const res = await getLocal(["a", "b"]);
    expect(res).toEqual({ a: 1, b: "two" });
  });

  it("returns only requested keys; missing keys are absent", async () => {
    await setLocal({ a: 1 });
    const res = await getLocal(["a", "missing"]);
    expect(res).toEqual({ a: 1 });
  });

  it("removes keys", async () => {
    await setLocal({ a: 1, b: 2 });
    await removeLocal("a");
    const res = await getLocal(["a", "b"]);
    expect(res).toEqual({ b: 2 });
  });

  it("rejects when chrome.runtime.lastError is set", async () => {
    chrome.runtime.lastError = { message: "boom" };
    await expect(getLocal(["a"])).rejects.toBeTruthy();
  });
});
