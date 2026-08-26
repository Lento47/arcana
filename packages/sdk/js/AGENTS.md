# sdk/js context

- Generated hey-api methods default `ThrowOnError = false`: non-2xx **resolves** as `{ error }` and never rejects. `.catch()` only sees network failures, the 30s timeout applied to mutating verbs only (`src/client.ts` customFetch), or `text/html` responses (response interceptor throws unconditionally). Callers wanting exceptions pass `{ throwOnError: true }` per call.
- `wrapClientError` (error interceptor) only wraps when `throwOnError` was set; result-tuple callers get the raw parsed body so `.error.name` / `JSON.stringify(error)` stay stable.
- Directory/workspace routing: GET/HEAD rewrite `x-opencode-directory` header into a `directory` query param (`rewrite` in client.ts); mutating requests rely on the header surviving.
