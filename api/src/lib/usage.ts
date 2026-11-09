/**
 * One log line of token counts per Claude call (numbers only, no article text), so cost per
 * analyze and any prompt-cache hits can be read from the logs.
 */
export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function logUsage(label: string, model: string, usage: UsageLike | undefined): void {
  if (!usage) return;
  console.log(
    `[usage] ${label} model=${model} in=${usage.input_tokens} out=${usage.output_tokens} ` +
      `cache_read=${usage.cache_read_input_tokens ?? 0} cache_write=${usage.cache_creation_input_tokens ?? 0}`
  );
}
