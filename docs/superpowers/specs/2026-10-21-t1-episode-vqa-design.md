# Selected episode VQA results

The user approved a detailed VQA display below the selected trajectory: saved episode score overview, capability scores, and expandable exact questions, first model answers and saved grades. Initial VQA and process checkpoints are separate. This extends the six-model/five-scene gallery; models without current trajectories stay empty.

The overview reads only the selected formal episode's existing scores. A new display-only sidecar copies the original public prompts and first final responses, joins the frozen initial-v2 grades and process-slot grades, and preserves result version, model, task, layout and final attempt. No scoring, aggregation, model call or simulation is performed. Formal leaderboard JSON and original artifacts remain immutable.

A per-episode API returns only a schema-validated allowlisted record. It exposes question text, visible first response text, saved score/status and checkpoint trigger/context steps. Hidden reasoning, complete request histories, system messages, images, credentials, gold references and private filesystem paths are excluded. The client fetches only the selected episode and aborts/ignores stale requests when selection changes.

Four score cards show VQA, Perception, Understanding and Reasoning out of 100; capability rows use the existing plain labels. Initial questions expand to their exact prompt, answer and grade. Scored process checkpoints display Task Tracking/Next Action scores and distinct native trigger/context steps. Normally unreached checkpoints display their saved protocol zero and Not reached state without an invented question or answer. Excluded initial questions retain null scores and responses.

Verification covers exact per-episode joins, original-score immutability, schema/privacy rejection, lazy API identity, null/zero semantics, request races, escaped question/answer text, selected-scene resets and desktop/mobile interaction. The work remains on the isolated feature branch and local preview; production deployment is outside this request.
