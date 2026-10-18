import test from "node:test";
import assert from "node:assert/strict";
import { durationText, findEpisode, outcomeText, scoreText } from "./result-format.ts";

test("missing scores stay missing while measured zeros are displayed", () => {
  assert.equal(scoreText(null), "—");
  assert.equal(scoreText(0), "0.00");
  assert.equal(scoreText(48.333333333333336), "48.33");
});

test("unknown stopped outcomes remain separate from measured failure", () => {
  assert.equal(outcomeText({ success: null, state: "budget_censored" }), "Unknown · stopped");
  assert.equal(outcomeText({ success: null, state: "infrastructure_error" }), "Unknown · stopped");
  assert.equal(outcomeText({ success: null, state: "not_started" }), "Unknown · not started");
  assert.equal(outcomeText({ success: false, state: "policy_early_stopped" }), "Not completed");
  assert.equal(outcomeText({ success: true, state: "success" }), "Succeeded");
});

test("episode selection requires the exact model and layout together", () => {
  const records = [
    { id: "kimi-136", modelId: "kimi", layoutId: 136, video: { id: "kimi-video" } },
    { id: "astra-125", modelId: "gpt6-astra", layoutId: 125, video: { id: "astra-125-video" } },
    { id: "astra-136", modelId: "gpt6-astra", layoutId: 136, video: { id: "astra-136-video" } },
  ];
  assert.equal(findEpisode(records, "gpt6-astra", 136)?.video.id, "astra-136-video");
  assert.equal(findEpisode(records, "kimi", 136)?.video.id, "kimi-video");
  assert.equal(findEpisode(records, "kimi", 125), undefined);
  assert.equal(findEpisode(records, "deepseek", 136), undefined);
});

test("elapsed durations preserve unknown and round boundaries without 60-second fragments", () => {
  assert.equal(durationText(null), "—");
  assert.equal(durationText(0), "0 s");
  assert.equal(durationText(59.8), "1 min 0 s");
  assert.equal(durationText(119.8), "2 min 0 s");
  assert.equal(durationText(7200), "2 h 0 min");
});
