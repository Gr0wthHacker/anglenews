import { beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";

const create = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    constructor(readonly status: number) {
      super(`status ${status}`);
    }
  }
  class FakeAnthropic {
    static APIError = APIError;
    messages = { create };
  }
  return { default: FakeAnthropic };
});

import { clearAngleCache, extractAngle } from "../angle-extractor.js";
import { clearTopicCache, normalizeTopic } from "../topic-normalizer.js";
import { createMemo } from "../../lib/memo.js";

const ANGLE_JSON = JSON.stringify({
  headline_framing: "Frames the vote as a win",
  central_entity: "City council",
  causal_attribution: "Council members",
  emotional_register: "neutral",
  solution_frame: "More funding",
  key_omissions: ["Cost"],
  quote_sources: [{ name: "A", affiliation: "B", stance: "for" }],
  statistical_anchoring: "12%",
  confidence: 1,
});

const TOPIC_JSON = JSON.stringify({
  topic: "City council passes budget",
  entities: ["City council"],
  dateContext: "November 2026",
  searchQueries: ["city budget"],
});

const reply = (text: string) => ({
  content: [{ type: "text", text }],
  usage: { input_tokens: 1000, output_tokens: 300 },
});

const client = () => new Anthropic() as unknown as Anthropic;

beforeEach(() => {
  create.mockReset();
  clearAngleCache();
  clearTopicCache();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("angle extraction spend", () => {
  it("pays once for the same article seen twice", async () => {
    create.mockResolvedValue(reply(ANGLE_JSON));
    await extractAngle(client(), "Budget passes", "Body text of the article");
    await extractAngle(client(), "Budget passes", "Body text of the article");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("shares one call between concurrent requests for the same article", async () => {
    create.mockResolvedValue(reply(ANGLE_JSON));
    await Promise.all([
      extractAngle(client(), "Budget passes", "Same body"),
      extractAngle(client(), "Budget passes", "Same body"),
    ]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("still analyzes a different article", async () => {
    create.mockResolvedValue(reply(ANGLE_JSON));
    await extractAngle(client(), "Budget passes", "Body one");
    await extractAngle(client(), "Budget passes", "Body two");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("retries once with the strict prompt when the answer does not parse", async () => {
    create.mockResolvedValueOnce(reply("not json")).mockResolvedValueOnce(reply(ANGLE_JSON));
    const angle = await extractAngle(client(), "Budget passes", "Body");
    expect(angle.central_entity).toBe("City council");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].system).toContain("MUST");
  });

  it("does not stack an app retry on top of the SDK's own retries for API errors", async () => {
    create.mockRejectedValue(new Error("529 overloaded"));
    await expect(extractAngle(client(), "Budget passes", "Body")).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not keep a failure, so the next request tries again", async () => {
    create.mockRejectedValueOnce(new Error("500")).mockResolvedValue(reply(ANGLE_JSON));
    await expect(extractAngle(client(), "Budget passes", "Body")).rejects.toThrow();
    await extractAngle(client(), "Budget passes", "Body");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("logs token counts for every call", async () => {
    create.mockResolvedValue(reply(ANGLE_JSON));
    await extractAngle(client(), "Budget passes", "Body");
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("in=1000 out=300"));
  });
});

describe("topic normalization spend", () => {
  it("reuses the topic for the same article, so the comparison cache key stays stable", async () => {
    create.mockResolvedValueOnce(reply(TOPIC_JSON)).mockResolvedValueOnce(
      reply(JSON.stringify({ ...JSON.parse(TOPIC_JSON), topic: "Council approves city budget" }))
    );
    const first = await normalizeTopic("Budget passes", "Excerpt");
    const second = await normalizeTopic("Budget passes", "Excerpt");
    expect(second.topic).toBe(first.topic);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("memo", () => {
  it("evicts the oldest entry past its size", async () => {
    const memo = createMemo<number>(60_000, 2);
    await memo.get("a", async () => 1);
    await memo.get("b", async () => 2);
    await memo.get("c", async () => 3);
    expect(memo.size).toBe(2);
    let calls = 0;
    await memo.get("a", async () => ++calls);
    expect(calls).toBe(1);
  });

  it("expires entries after the TTL", async () => {
    vi.useFakeTimers();
    try {
      const memo = createMemo<number>(1000, 10);
      let calls = 0;
      await memo.get("a", async () => ++calls);
      vi.advanceTimersByTime(1001);
      await memo.get("a", async () => ++calls);
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
