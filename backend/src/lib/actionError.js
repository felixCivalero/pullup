// One error type for everything a caller can get wrong or be refused, from
// any door (site route, remote MCP, WebMCP). `code` is stable and machine
// readable; `message` is written for the person or their assistant — it says
// what to do next, never a stack trace.
export class ActionError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "ActionError";
    this.code = code;
    this.extra = extra;
  }
}

export const HTTP_STATUS = {
  invalid: 400,
  unauthenticated: 401,
  payment_required: 402,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  failed: 500,
};

export const statusFor = (code) => HTTP_STATUS[code] || 500;
