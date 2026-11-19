// Tests must never reach Graph, Entra or anything else: any fetch a test has
// not replaced fails loudly instead of silently calling the real service.
// vi.unstubAllGlobals() restores this thrower, not the real fetch.
globalThis.fetch = (async (input: RequestInfo | URL) => {
  throw new Error(`Network access in a test: ${String(input)}`);
}) as typeof fetch;
