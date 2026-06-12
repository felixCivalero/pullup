// TEMPORARY: deliberately-failing test to prove the deploy gate blocks a red
// build. Pushed on its own (no app-code changes), so even a gate bug couldn't
// hurt prod. Reverted immediately after the gate demonstrates the abort.
console.log("🧪 gate-proof: this test fails on purpose");
process.exit(1);
