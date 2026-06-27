// =====================================================================
// Back-compat shim — the OpenAI client was generalized to dom/llm.js when
// LearnWise gained multi-provider BYO-key support. Kept so older imports
// keep working; new code should import from ./llm.js directly.
// =====================================================================
import { fetchByokTranslations, LlmError } from "./llm.js";

export { LlmError as OpenAIError };

/** @deprecated use fetchByokTranslations({ providerId, ... }) */
export function fetchOpenAITranslations(args = {}) {
  return fetchByokTranslations({ ...args, providerId: "openai" });
}
