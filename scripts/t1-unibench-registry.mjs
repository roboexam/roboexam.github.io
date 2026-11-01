// Track 1 UniBench-24 final publication (AgentBench claude/final-v1, board ac25a47).
// Source files are pinned by SHA-256; scripts/export-t1-unibench.mjs validates them and writes
// app/data/generated/t1-unibench-{results,vqa}.json. Media are served from publicationRoot/media
// (override with T1_UNIBENCH_MEDIA_ROOT).
export const t1UnibenchRegistry = Object.freeze({
  resultVersion: "t1-unibench24-final-20261102-v1",
  publicationRoot: "/mnt/gyc_ckp/benchmark2027/experiments/evaluation/track1/t1-unibench24-final-20261102-v1",
  sourcePins: Object.freeze({
    "t1-unibench-results.json": "2c7bd4c080e99c2cbace41a9eb18880aeb66d9c69f9721e194aa447da9ccbd75",
    "t1-unibench-vqa.json": "d91077cf8eddb0de4dfc640176f874d5cac48387654e98820175602a300a6f01",
  }),
  generatedPins: Object.freeze({
    "t1-unibench-results.json": "d0ea21e38d21ed82f03e7b6122ebc40771205b39d81ee76efba1ae2678cfaf19",
    "t1-unibench-vqa.json": "8248953a1e86523da6a494304e7a79ef2b00f5ec943442f843bf033234b2c779",
  }),
});
