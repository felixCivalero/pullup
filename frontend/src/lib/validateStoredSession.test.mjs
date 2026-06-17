// Run: node src/lib/validateStoredSession.test.mjs
// The LandingPage login-view check used to local-signOut on any getUser 401/403.
// A transient refresh failure inside getUser produces that same 401 while the
// refresh token is still valid — so it could clear a recoverable session. This
// proves the refresh-then-recover fix.
import assert from "node:assert";
import { resolveStoredSession } from "./validateStoredSession.mjs";

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

await test("no stored session → 'none'", async () => {
  const out = await resolveStoredSession({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => assert.fail("should not call getUser without a session"),
      refreshSession: async () => assert.fail("should not refresh"),
    },
  });
  assert.equal(out.status, "none");
});

await test("valid stored session → 'valid'", async () => {
  const out = await resolveStoredSession({
    auth: {
      getSession: async () => ({ data: { session: { access_token: "t" } } }),
      getUser: async () => ({ data: { user: { id: "u1" } }, error: null }),
      refreshSession: async () => assert.fail("should not refresh a valid session"),
    },
  });
  assert.equal(out.status, "valid");
});

await test("getUser 401 but refresh recovers → 'valid' (the bug)", async () => {
  let refreshes = 0;
  const out = await resolveStoredSession({
    auth: {
      getSession: async () => ({ data: { session: { access_token: "t" } } }),
      getUser: async () => ({ data: { user: null }, error: { status: 401 } }),
      refreshSession: async () => {
        refreshes++;
        return { data: { session: { access_token: "fresh" } }, error: null };
      },
    },
  });
  assert.equal(out.status, "valid");
  assert.equal(refreshes, 1);
});

await test("getUser 401 and refresh fails → 'dead'", async () => {
  const out = await resolveStoredSession({
    auth: {
      getSession: async () => ({ data: { session: { access_token: "t" } } }),
      getUser: async () => ({ data: { user: null }, error: { status: 403 } }),
      refreshSession: async () => ({ data: { session: null }, error: { message: "revoked" } }),
    },
  });
  assert.equal(out.status, "dead");
});

await test("getUser transient network error (no status) → 'unknown', session untouched", async () => {
  const out = await resolveStoredSession({
    auth: {
      getSession: async () => ({ data: { session: { access_token: "t" } } }),
      getUser: async () => ({ data: { user: null }, error: { message: "Failed to fetch" } }),
      refreshSession: async () => assert.fail("must not refresh on a non-auth error"),
    },
  });
  assert.equal(out.status, "unknown");
});

console.log(`\n${passed} passed`);
