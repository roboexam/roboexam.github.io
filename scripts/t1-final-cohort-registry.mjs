// Publication identity and immutable source pins. Scores live only in sealed inputs.
export const t1FinalCohortRegistry = {
  resultVersion: "t1-robodojo14-gpt-deepseek-20261023-v3",
  generatedAt: "2026-10-23T00:00:00Z",
  publicationScopeId: "robodojo14-common-eval5-v1",
  baselineCommit: "9672e2cc20fa0ac89f5cca62b436b387bbc1209a",
  initialScorerPolicy: "agentbench.lenient-matching.v3",
  equivalencesSha256: "a31589e911514ddbc7b5861a186c8ca5544af63497b2e8e1bc91aaed11718f97",
  missingScorePolicy: "zero-unscorable",
  processCaptureSha256s: ["7ec0792e9b604336b66f2c6481ddb265eb813067b00c7956304054370d2708c8", "6a7986ab60fa1c9d63ed5f1a12b908ea98cc369565569d71881584eb2b27e55b"],
  models: [
    { candidate: "gpt", id: "gpt-6-1-sol", label: "GPT-6.1-sol", requestModel: "gpt-6.1-sol" },
    { candidate: "deepseek", id: "deepseek", label: "DeepSeek Flash", requestModel: "deepseek-flash" },
  ],
  sourcePins: { cohort: "b15010c1b0ed8dc2e749d5bee4b580adef42dced5e70394d4da5e1a3ad9f0332", "vqa-details": "89ff35962823e240a9c710b13424bb11e391bf001e1fc8d1173655c0e324e9e3" },
};
