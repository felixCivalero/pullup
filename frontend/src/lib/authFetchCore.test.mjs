// Run: node src/lib/authFetchCore.test.mjs
// Tests the session-recovery core of authenticatedFetch in isolation (no real
// Supabase client). Proves the live "logged out very often" bug is fixed: a
// transient refresh failure / 401 race must NOT wipe a still-valid session.
import assert from "node:assert";
import { fetchWithSessionRecovery } from "./authFetchCore.mjs";

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

// A fake response with just the status we assert on.
const res = (status) => ({ status });

await test(
  "transient getSession=null but refresh recovers → request succeeds, session NOT wiped",
  async () => {
    // This is the live bug: a network blip during token rotation makes
    // getSession() return null even though the refresh token is still valid.
    let deadCalls = 0;
    let refreshCalls = 0;
    const sent = [];
    const out = await fetchWithSessionRecovery({
      auth: {
        getSession: async () => ({ data: { session: null } }),
        refreshSession: async () => {
          refreshCalls++;
          return { data: { session: { access_token: "fresh" } }, error: null };
        },
      },
      doFetch: async (token) => {
        sent.push(token);
        return res(200);
      },
      onDeadSession: async () => {
        deadCalls++;
      },
    });
    assert.equal(out.status, 200);
    assert.equal(deadCalls, 0, "must not wipe a recoverable session");
    assert.equal(refreshCalls, 1, "should refresh exactly once to recover");
    assert.deepEqual(sent, ["fresh"], "request must carry the refreshed token");
  },
);

await test(
  "valid token but spurious 401 → refresh + retry succeeds, session NOT wiped",
  async () => {
    let deadCalls = 0;
    const sent = [];
    const out = await fetchWithSessionRecovery({
      auth: {
        getSession: async () => ({ data: { session: { access_token: "stale" } } }),
        refreshSession: async () => ({
          data: { session: { access_token: "fresh" } },
          error: null,
        }),
      },
      doFetch: async (token) => {
        sent.push(token);
        return res(token === "fresh" ? 200 : 401);
      },
      onDeadSession: async () => {
        deadCalls++;
      },
    });
    assert.equal(out.status, 200);
    assert.equal(deadCalls, 0, "401 that a refresh fixes must not log the user out");
    assert.deepEqual(sent, ["stale", "fresh"]);
  },
);

await test(
  "genuinely dead session (refresh fails, still 401) → wiped exactly once and throws",
  async () => {
    let deadCalls = 0;
    await assert.rejects(
      fetchWithSessionRecovery({
        auth: {
          getSession: async () => ({ data: { session: null } }),
          refreshSession: async () => ({
            data: { session: null },
            error: new Error("invalid refresh token"),
          }),
        },
        doFetch: async () => res(401),
        onDeadSession: async () => {
          deadCalls++;
        },
      }),
      /Unauthorized/,
    );
    assert.equal(deadCalls, 1, "a truly dead session is still cleared");
  },
);

await test("happy path: valid token, 200 → no refresh, no wipe", async () => {
  let refreshCalls = 0;
  let deadCalls = 0;
  const out = await fetchWithSessionRecovery({
    auth: {
      getSession: async () => ({ data: { session: { access_token: "good" } } }),
      refreshSession: async () => {
        refreshCalls++;
        return { data: { session: null }, error: null };
      },
    },
    doFetch: async () => res(200),
    onDeadSession: async () => {
      deadCalls++;
    },
  });
  assert.equal(out.status, 200);
  assert.equal(refreshCalls, 0, "no needless refresh on the happy path");
  assert.equal(deadCalls, 0);
});

console.log(`\n${passed} passed`);
