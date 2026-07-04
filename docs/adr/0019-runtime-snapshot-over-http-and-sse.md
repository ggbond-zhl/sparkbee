# Runtime Snapshot Over HTTP And SSE

SparkBee will expose the current 运行状态快照 through `GET /api/charging-points/{id}/runtime-snapshot`, and `GET /api/charging-points/{id}/events` will send the same snapshot as its first SSE event before forwarding incremental events. HTTP is the reusable query surface for current facts, while SSE remains the per-charging-point change stream; both read from the same in-process projection so page refreshes can restore current state without introducing durable event replay or browser-local state as a source of truth.
