import details from "./generated/t1-benchmark-vqa.json" with { type: "json" };
import { t1BenchmarkResults, type T1BenchmarkResults } from "./t1-benchmark-results.ts";
import type { T1BenchmarkVqaBundle, T1BenchmarkVqaEpisode } from "./t1-benchmark-vqa.ts";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/;
const SHA = /^[a-f0-9]{64}$/;
const PRIVATE = /(?:\/(?:bh|mnt|Users|root|home|tmp|private)\/|file:\/\/|https?:\/\/|data:image\/|\bsk-[A-Za-z0-9_-]{12,}|\bBearer\s+[A-Za-z0-9._-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|["']?(?:api[_-]?key|authorization)["']?\s*[:=]|<\/?think\b)/i;

export class T1BenchmarkVqaInvalid extends Error {
  constructor() { super("Invalid T1 VQA publication"); this.name = "T1BenchmarkVqaInvalid"; }
}

function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new T1BenchmarkVqaInvalid();
}

function object(value: unknown): Record<string, unknown> {
  requireValid(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, expected: string[]) {
  requireValid(Object.keys(value).sort().join("\u0000") === [...expected].sort().join("\u0000"));
}

function text(value: unknown, nonempty = true): asserts value is string {
  requireValid(typeof value === "string" && (!nonempty || value.trim().length > 0));
  const scanned = value.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\\\//g, "/");
  requireValid(!PRIVATE.test(scanned));
}

function identifier(value: unknown): asserts value is string {
  requireValid(typeof value === "string" && ID.test(value));
}

function score(value: unknown) {
  requireValid(typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100);
}

function step(value: unknown): asserts value is number {
  requireValid(typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

function nullableStep(value: unknown): asserts value is number | null {
  if (value !== null) step(value);
}

function freeze(value: unknown) {
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
}

/** Validate one safe static publication against exact formal episode identities. */
export function createT1BenchmarkVqaStore(raw: unknown, formal: T1BenchmarkResults) {
  const bundle = object(raw);
  keys(bundle, ["schemaVersion", "resultVersion", "sourceHashes", "episodes"]);
  requireValid(bundle.schemaVersion === "roboexam.t1-benchmark-vqa.v1" && bundle.resultVersion === formal.resultVersion);
  const hashes = object(bundle.sourceHashes);
  requireValid(Object.keys(hashes).length > 0);
  for (const [name, digest] of Object.entries(hashes)) {
    identifier(name);
    requireValid(typeof digest === "string" && SHA.test(digest));
  }
  for (const [name, digest] of Object.entries(formal.provenance.sourceHashes)) requireValid(hashes[name] === digest);

  const allowed = new Map<string, (typeof formal.episodes)[number]>();
  for (const episode of formal.episodes) {
    identifier(episode.id);
    requireValid(!allowed.has(episode.id));
    allowed.set(episode.id, episode);
  }
  requireValid(Array.isArray(bundle.episodes));
  const episodes = new Map<string, T1BenchmarkVqaEpisode>();
  for (const item of bundle.episodes) {
    const episode = object(item);
    keys(episode, ["episodeId", "resultVersion", "modelId", "taskId", "layoutId", "attempt", "initial", "checkpoints"]);
    identifier(episode.episodeId);
    requireValid(!episodes.has(episode.episodeId));
    const source = allowed.get(episode.episodeId);
    requireValid(source);
    requireValid(Number.isSafeInteger(source.execution.steps) && source.execution.steps >= 0);
    for (const field of ["modelId", "taskId", "attempt"] as const) {
      identifier(episode[field]);
      requireValid(episode[field] === source[field]);
    }
    requireValid(episode.resultVersion === (source.resultVersion ?? formal.resultVersion));
    step(episode.layoutId);
    requireValid(episode.layoutId === source.layoutId);
    requireValid(Array.isArray(episode.initial) && Array.isArray(episode.checkpoints));
    const questions = new Set<string>();
    for (const value of episode.initial) {
      const question = object(value);
      const fields = ["questionId", "metricId", "question", "response", "score", "status", "formatCompliant"];
      keys(question, question.status === "infrastructure_missing" ? [...fields, "scoreOrigin", "observedScore"] : fields);
      text(question.questionId);
      identifier(question.metricId);
      text(question.question);
      requireValid(!questions.has(question.questionId)); questions.add(question.questionId);
      requireValid(question.formatCompliant === null || typeof question.formatCompliant === "boolean");
      if (question.status === "scored") {
        text(question.response, false); score(question.score);
      } else if (question.status === "infrastructure_missing") {
        requireValid(formal.provenance.missingScorePolicy === "zero-unscorable");
        requireValid(question.score === 0 && question.response === null && question.formatCompliant === null &&
          question.scoreOrigin === "policy_zero" && question.observedScore === null);
      } else {
        requireValid(question.status === "not_graded" && question.score === null);
        if (question.response !== null) text(question.response, false);
      }
    }
    const slots = new Set<string>();
    const returnedQuestions = new Map<string, string>();
    for (const value of episode.checkpoints) {
      const checkpoint = object(value);
      const fields = ["slotId", "stageId", "status", "questionId", "question", "response", "triggerStep", "returnStep", "scores"];
      keys(checkpoint, checkpoint.status === "reached_reference_blocked" ? [...fields, "scoreOrigin", "observedScores"] : fields);
      identifier(checkpoint.stageId); text(checkpoint.slotId);
      requireValid(checkpoint.slotId === `${episode.taskId}/${episode.layoutId}/${checkpoint.stageId}` && !slots.has(checkpoint.slotId));
      slots.add(checkpoint.slotId);
      const scores = object(checkpoint.scores); keys(scores, ["c2", "c3"]); score(scores.c2); score(scores.c3);
      if (checkpoint.status === "scored") {
        text(checkpoint.questionId); text(checkpoint.question); text(checkpoint.response, false);
        step(checkpoint.triggerStep); step(checkpoint.returnStep);
        requireValid(checkpoint.returnStep >= checkpoint.triggerStep && checkpoint.returnStep <= source.execution.steps);
        const projection = JSON.stringify([checkpoint.question, checkpoint.response, checkpoint.returnStep, scores.c2, scores.c3]);
        requireValid(!returnedQuestions.has(checkpoint.questionId) || returnedQuestions.get(checkpoint.questionId) === projection);
        returnedQuestions.set(checkpoint.questionId, projection);
      } else if (checkpoint.status === "reached_reference_blocked") {
        requireValid(formal.provenance.missingScorePolicy === "zero-unscorable");
        text(checkpoint.questionId);
        requireValid(checkpoint.question === null && checkpoint.response === null && scores.c2 === 0 && scores.c3 === 0 && checkpoint.scoreOrigin === "policy_zero");
        const observed = object(checkpoint.observedScores); keys(observed, ["c2", "c3"]);
        requireValid(observed.c2 === null && observed.c3 === null);
        nullableStep(checkpoint.triggerStep); nullableStep(checkpoint.returnStep);
        requireValid((checkpoint.triggerStep === null) === (checkpoint.returnStep === null));
        if (checkpoint.triggerStep !== null && checkpoint.returnStep !== null) {
          requireValid(checkpoint.returnStep >= checkpoint.triggerStep && checkpoint.returnStep <= source.execution.steps);
        }
      } else {
        requireValid(checkpoint.status === "not_reached" && scores.c2 === 0 && scores.c3 === 0);
        for (const field of ["questionId", "question", "response", "triggerStep", "returnStep"]) requireValid(checkpoint[field] === null);
      }
    }
    const copy = structuredClone(episode) as T1BenchmarkVqaEpisode;
    freeze(copy);
    episodes.set(copy.episodeId, copy);
  }
  return Object.freeze({ getEpisode(id: string): T1BenchmarkVqaEpisode | null { return ID.test(id) ? episodes.get(id) ?? null : null; } });
}

let store: ReturnType<typeof createT1BenchmarkVqaStore> | undefined;

/** Only the server imports the detailed static JSON. No filesystem or network access. */
export function getT1BenchmarkVqaEpisode(id: string): T1BenchmarkVqaEpisode | null {
  if (typeof id !== "string" || !ID.test(id)) return null;
  store ??= createT1BenchmarkVqaStore(details as T1BenchmarkVqaBundle, t1BenchmarkResults);
  return store.getEpisode(id);
}
