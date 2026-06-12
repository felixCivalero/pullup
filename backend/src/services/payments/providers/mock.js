// backend/src/services/payments/providers/mock.js
//
// The mock rail: lets the ENTIRE v2 checkout run end-to-end — charge,
// instructions, webhook-shaped settlement, RSVP confirmation, ledger row —
// with zero merchant agreements. Exists only outside production (or when
// MOCK_PAYMENTS_ENABLED is set, e.g. a staging probe). The confirm endpoint
// in paymentsV2.js plays the role of the rail's webhook.

import crypto from "node:crypto";
import { mockPaymentsEnabled } from "../../../config/billing.js";

export const mockProvider = {
  key: "mock",

  available() {
    return mockPaymentsEnabled();
  },

  // A mock charge is born pending; settlement comes from the confirm endpoint.
  async createCharge({ description }) {
    const providerRef = `mock_${crypto.randomUUID()}`;
    return {
      providerRef,
      status: "pending",
      instructions: {
        type: "mock",
        message: `Simulated charge (${description || "ticket"}). POST /payments/v2/mock/${providerRef}/confirm to settle.`,
        confirmPath: `/payments/v2/mock/${providerRef}/confirm`,
      },
    };
  },
};
