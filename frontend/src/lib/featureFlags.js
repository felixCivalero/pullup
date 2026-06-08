// Runtime feature flags. Keep these dead simple — a constant per flag — so
// flipping one back on is a one-line change with an obvious blast radius.

// The AI "build the look" canvas (the create-page dock that flips to a Claude
// build chat → POST /host/canvas/chat → Anthropic). PAUSED while we're out of
// Anthropic credits: the create-page dock stays on Messages, consistent with
// everywhere else you're logged in. Flip to `true` to bring the canvas back.
export const AI_CREATE_ENABLED = false;
