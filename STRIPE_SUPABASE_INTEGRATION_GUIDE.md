# Stripe + Supabase Integration Guide

## 🎯 Best Practices Overview

**Short Answer**: Yes, you should create a `payments` table, and link Stripe customers via `stripe_customer_id` in your users table.

---

## 📊 Recommended Database Schema

### 1. **Users Table** (Supabase Auth + Profile Extension)

```sql
-- Supabase Auth provides: id, email, created_at, etc.
-- Create a profiles table to extend auth.users:

CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  username TEXT UNIQUE,
  bio TEXT,
  profile_picture_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Stripe Integration
  stripe_customer_id TEXT UNIQUE, -- Links to Stripe Customer
  stripe_account_id TEXT, -- If using Stripe Connect for host payouts

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_profiles_stripe_customer_id ON public.profiles(stripe_customer_id);
```

**Why store `stripe_customer_id` in users table?**

- One-to-one relationship: each user has one Stripe customer
- Quick lookups without API calls
- Enables customer portal access
- Simplifies subscription management (if you add subscriptions later)

---

### 2. **Payments Table** (Store Payment Records)

```sql
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  rsvp_id UUID REFERENCES public.rsvps(id) ON DELETE SET NULL,

  -- Stripe Fields
  stripe_payment_intent_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT, -- Denormalized for quick queries
  stripe_charge_id TEXT,
  stripe_checkout_session_id TEXT,

  -- Payment Details
  amount INTEGER NOT NULL, -- Amount in cents (e.g., 2000 = $20.00)
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL, -- 'pending', 'succeeded', 'failed', 'refunded', 'canceled'
  payment_method TEXT, -- 'card', 'bank_transfer', etc.

  -- Metadata
  description TEXT,
  receipt_url TEXT, -- Stripe receipt URL
  refunded_amount INTEGER DEFAULT 0, -- Amount refunded in cents
  refunded_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ, -- When payment succeeded

  -- Additional data
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_payments_user_id ON public.payments(user_id);
CREATE INDEX idx_payments_event_id ON public.payments(event_id);
CREATE INDEX idx_payments_rsvp_id ON public.payments(rsvp_id);
CREATE INDEX idx_payments_stripe_payment_intent_id ON public.payments(stripe_payment_intent_id);
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE INDEX idx_payments_created_at ON public.payments(created_at DESC);
```

**Why store payments locally?**

- ✅ **Fast queries**: No API calls needed for payment history
- ✅ **Analytics**: Aggregate payment data quickly
- ✅ **Compliance**: Keep records for accounting/taxes
- ✅ **Offline access**: View payments even if Stripe API is down
- ✅ **Webhook reliability**: Store data even if webhook processing fails

**Important**: Always sync with Stripe via webhooks to keep data accurate.

---

### 3. **Events Table** (Add Stripe Product/Price IDs)

```sql
-- Add to your existing events table:

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS stripe_product_id TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ticket_price INTEGER; -- Price in cents

CREATE INDEX idx_events_stripe_price_id ON public.events(stripe_price_id);
```

**Why store Stripe Product/Price IDs?**

- Link events to Stripe products for checkout
- Enable dynamic pricing per event
- Track which Stripe products correspond to which events

---

### 4. **RSVPs Table** (Link to Payments)

```sql
-- Add to your existing rsvps table:

ALTER TABLE public.rsvps ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL;
ALTER TABLE public.rsvps ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'; -- 'unpaid', 'pending', 'paid', 'refunded'

CREATE INDEX idx_rsvps_payment_id ON public.rsvps(payment_id);
CREATE INDEX idx_rsvps_payment_status ON public.rsvps(payment_status);
```

**Why link RSVPs to payments?**

- Know which RSVPs have been paid for
- Handle refunds (cancel RSVP when payment refunded)
- Display payment status in guest lists

---

## 🔄 Data Flow: How It Works

### **1. User Signs Up / First Payment**

```
1. User signs up → Supabase Auth creates user
2. User creates profile → profiles table created
3. User makes first payment → Create Stripe Customer
4. Store stripe_customer_id in profiles table
5. Create payment record in payments table
```

### **2. Payment Flow for Paid Event**

```
1. User RSVPs to paid event
2. Backend creates Stripe Checkout Session (or Payment Intent)
3. User completes payment on Stripe
4. Stripe webhook → Backend creates/updates payment record
5. Link payment to RSVP
6. Update RSVP payment_status to 'paid'
```

### **3. Webhook Processing**

```
Stripe Webhook Events to Handle:
- payment_intent.succeeded → Update payment.status = 'succeeded', link to RSVP
- payment_intent.payment_failed → Update payment.status = 'failed'
- charge.refunded → Update payment.status = 'refunded', refunded_amount
- checkout.session.completed → Link payment to RSVP
```

---

## 💻 Implementation Example

### **Backend: Create Stripe Customer on First Payment**

```javascript
// backend/src/stripe.js
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function getOrCreateStripeCustomer(userId, email, name) {
  // Check if user already has Stripe customer ID
  const profile = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();

  if (profile.data?.stripe_customer_id) {
    return profile.data.stripe_customer_id;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      user_id: userId,
    },
  });

  // Store in database
  await supabase
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId);

  return customer.id;
}
```

### **Backend: Create Payment Intent**

```javascript
// backend/src/routes/payments.js
app.post("/api/events/:eventId/create-payment", async (req, res) => {
  const { eventId } = req.params;
  const userId = req.user.id; // From auth middleware

  // Get event
  const event = await getEvent(eventId);
  if (!event || event.ticket_type !== "paid") {
    return res.status(400).json({ error: "Event is not paid" });
  }

  // Get or create Stripe customer
  const customerId = await getOrCreateStripeCustomer(
    userId,
    req.user.email,
    req.user.name
  );

  // Create Payment Intent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: event.ticket_price, // in cents
    currency: "usd",
    customer: customerId,
    metadata: {
      event_id: eventId,
      user_id: userId,
    },
  });

  // Store payment record (status: 'pending')
  const payment = await supabase
    .from("payments")
    .insert({
      user_id: userId,
      event_id: eventId,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_customer_id: customerId,
      amount: event.ticket_price,
      currency: "usd",
      status: "pending",
    })
    .select()
    .single();

  res.json({
    client_secret: paymentIntent.client_secret,
    payment_id: payment.data.id,
  });
});
```

### **Backend: Webhook Handler**

```javascript
// backend/src/routes/webhooks.js
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case "payment_intent.succeeded":
        const paymentIntent = event.data.object;

        // Update payment record
        await supabase
          .from("payments")
          .update({
            status: "succeeded",
            stripe_charge_id: paymentIntent.latest_charge,
            paid_at: new Date().toISOString(),
          })
          .eq("stripe_payment_intent_id", paymentIntent.id);

        // Find and update RSVP
        const payment = await supabase
          .from("payments")
          .select("rsvp_id, event_id")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .single();

        if (payment.data?.rsvp_id) {
          await supabase
            .from("rsvps")
            .update({ payment_status: "paid" })
            .eq("id", payment.data.rsvp_id);
        }
        break;

      case "charge.refunded":
        const charge = event.data.object;

        await supabase
          .from("payments")
          .update({
            status: "refunded",
            refunded_amount: charge.amount_refunded,
            refunded_at: new Date().toISOString(),
          })
          .eq("stripe_charge_id", charge.id);

        // Optionally cancel RSVP
        const refundedPayment = await supabase
          .from("payments")
          .select("rsvp_id")
          .eq("stripe_charge_id", charge.id)
          .single();

        if (refundedPayment.data?.rsvp_id) {
          await supabase
            .from("rsvps")
            .update({ payment_status: "refunded" })
            .eq("id", refundedPayment.data.rsvp_id);
        }
        break;
    }

    res.json({ received: true });
  }
);
```

---

## ✅ Key Takeaways

1. **Store `stripe_customer_id` in users/profiles table** - One-to-one relationship
2. **Create a `payments` table** - Store all payment records locally
3. **Link payments to RSVPs** - Track which RSVPs are paid
4. **Use webhooks** - Keep local data in sync with Stripe
5. **Store Stripe Product/Price IDs on events** - For dynamic pricing
6. **Index frequently queried fields** - Performance optimization

---

## 🔐 Security Considerations

- **Never store full card numbers** - Stripe handles this
- **Validate webhook signatures** - Prevent fake webhook calls
- **Use Row Level Security (RLS)** - Users can only see their own payments
- **Sanitize metadata** - Don't store sensitive data in metadata fields

---

## 📝 RLS Policies Example

```sql
-- Users can only see their own payments
CREATE POLICY "Users can view own payments"
ON public.payments FOR SELECT
USING (auth.uid() = user_id);

-- Event hosts can see payments for their events
CREATE POLICY "Hosts can view event payments"
ON public.payments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id = payments.event_id
    AND events.user_id = auth.uid()
  )
);
```

---

## 🚀 Next Steps

1. Set up Supabase tables with the schema above
2. Install Stripe SDK: `npm install stripe`
3. Create webhook endpoint
4. Implement payment creation flow
5. Test with Stripe test mode
6. Set up webhook forwarding (use Stripe CLI for local dev)

---

_This guide follows Stripe and Supabase best practices for production applications._
