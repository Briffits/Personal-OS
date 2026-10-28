# Frozen medication v2 fixture

Synthetic values only. The field layout matches the recorded installed source
`a7a78c0d17d2f74376d7d6caa5fc4c9f013d218e` and its verified storage baseline
`ce7e0542d85778f441a5773683cb865d1c15feee`. This is not a device export.

Keep the JSON independent of current serializers: Swift and TypeScript consume
these exact bytes. It covers manual history, opaque mismatched/retained sources,
zero/fractional thresholds, null, zero and maximum-safe-integer legacy stock.
