# Per-Charging-Point SSE Without Replay

SparkBee will expose V1 real-time updates through `GET /api/charging-points/{id}/events`, scoped to one 桩实例. The stream sends an initial snapshot and then forwards new in-memory actor events only; it intentionally ignores `Last-Event-ID` and does not replay events after reconnect because V1 values a simple live debugging surface over durable event history.
