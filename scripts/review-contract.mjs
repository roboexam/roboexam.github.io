import assert from "node:assert/strict";

export const REVIEW_MEDIA_ROOTS = Object.freeze({
  staging: "/mnt/gyc_ckp/benchmark2027/runtime/staging/robodojo_data_generation",
  "review-cache": "/mnt/gyc_ckp/benchmark2027/runtime/caches/dashboard_review_media/v1",
});
export function assertReviewCandidate(candidate) {
  const clean = candidate.qualification?.clean;
  assert.ok(clean === true || clean === null, "unqualified candidate is not publishable");
  assert.equal(candidate.qualification.functional, true);
  if (clean === true) {
    assert.equal(candidate.checks.clean_selector_passed, true);
    assert.ok(!candidate.machineStatus || candidate.machineStatus === "clean_selected");
  } else {
    assert.equal(candidate.machineStatus, "technical_pass_purpose_pending");
    assert.ok(candidate.evidence?.length > 0, "technical candidate needs bound independent evidence");
    assert.notEqual(candidate.checks.clean_selector_passed, true);
  }
  assert.ok(candidate.qualification.strongFidelity === null ||
    typeof candidate.qualification.strongFidelity === "boolean");
  const memberships = candidate.memberships ?? [];
  for (const member of memberships) {
    assert.ok(["ID", "Semantic OOD", "Visual OOD", "REC"].includes(member.family), "unknown distribution/recovery family");
    assert.ok(["primary", "backup", "development", "validation"].includes(member.role));
    assert.ok(typeof member.batch === "string" && !member.batch.includes("/"),
      "batch identity must not expose filesystem paths");
  }
}
export function reviewMediaRoot(id = "staging") {
  assert.ok(Object.hasOwn(REVIEW_MEDIA_ROOTS, id), "unknown media root");
  return REVIEW_MEDIA_ROOTS[id];
}
