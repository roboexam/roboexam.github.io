# T1 five-rollout gallery

The user requests removal of the Peak Progress column and Kimi K3 row, and five selectable trajectory videos for each model/task. Other models keep their saved scores, while their trajectory positions remain empty until the new evaluations are published. No score is recalculated.

The leaderboard retains six models. The video model selector includes all six models, and the task selector uses the fourteen tasks in the current publication. Each task shows its five admitted scene IDs in publication order, rather than the seven-ID union across tasks. Five scene cards sit above one main player; available clips show a video preview and select the main player. Empty cards retain their scene labels without a video, score or missing-data message. Changing a task or model resets the selected scene and keyed player while preserving the chosen task across models.

The existing formal JSON and legacy source data stay immutable. The presentation adapter excludes Kimi and Peak Progress and keeps only current-protocol DeepSeek episodes in this gallery. Exact model/task/scene/version joins continue to control video and episode facts. Responsive cards use five columns on desktop and two on mobile. Keyboard focus and selected state are explicit.

Validation covers source immutability, six model identities, five per-task scene slots (including tasks whose scenes differ), empty-model rendering, stale evidence rejection, desktop/mobile selection, typecheck, lint, build and relevant server tests. Work stays in the isolated feature branch and preview; deployment is outside this request.
