# Current Stripe Setup Summary

## ✅ What's Implemented

### 1. **Backend Infrastructure**

#### **Package Dependencies**

- ✅ `stripe` package installed (v17.7.0)
- ✅ Lazy initialization (only creates Stripe client when needed)
- ✅ Graceful error handling if `STRIPE_SECRET_KEY` is missing

#### **Data Structures** (`backend/src/data.js`)

**Payments Array**

- In-memory `payments` array to store payment records
- Payment records include:
  - Stripe IDs (payment intent, customer, charge, checkout session)
  - Amount, currency, status
  - Links to user, event, and RSVP
  - Refund tracking
  - Receipt URLs

**People/Contacts**

- ✅ `stripeCustomerId` field added to person records
- ✅ Function: `updatePersonStripeCustomerId()` to link Stripe customers

**Events**

- ✅ `ticketPrice` - Price in cents (e.g., 2000 = $20.00)
- ✅ `stripeProductId` - Stripe Product ID (optional)
- ✅ `stripePriceId` - Stripe Price ID (optional)

**RSVPs**

- ✅ `paymentId` - Links RSVP to payment record
- ✅ `paymentStatus` - "unpaid" | "pending" | "paid" | "refunded"
- ✅ Auto-updates when payment status changes

#### **Payment Functions** (`backend/src/data.js`)

✅ **Core Functions:**

- `createPayment()` - Create new payment record
- `findPaymentById()` - Find payment by ID
- `findPaymentByStripePaymentIntentId()` - Find by Stripe payment intent
- `findPaymentByStripeChargeId()` - Find by Stripe charge ID
- `updatePayment()` - Update payment (auto-updates linked RSVP)
- `getPaymentsForUser()` - Get all payments for a user
- `getPaymentsForEvent()` - Get all payments for an event

---

### 2. **Stripe Utility Functions** (`backend/src/stripe.js`)

✅ **Customer Management:**

- `getOrCreateStripeCustomer(email, name)`
  - Finds or creates Stripe customer
  - Stores `stripeCustomerId` in person record
  - Returns Stripe customer ID

✅ **Payment Processing:**

- `createPaymentIntent({ customerId, amount, eventId, eventTitle, personId })`
  - Creates Stripe Payment Intent
  - Includes metadata for tracking
  - Returns payment intent with `client_secret`

✅ **Webhook Handling:**

- `handleStripeWebhook(event)` - Routes webhook events
- Handles:
  - ✅ `payment_intent.succeeded` - Updates payment to "succeeded", links to RSVP
  - ✅ `payment_intent.payment_failed` - Updates payment to "failed"
  - ✅ `charge.refunded` - Updates payment to "refunded", tracks refund amount

---

### 3. **API Endpoints** (`backend/src/index.js`)

✅ **Payment Creation:**

```
POST /host/events/:eventId/create-payment
Body: { email, name, rsvpId? }
Response: { client_secret, payment_id, payment_intent_id }
```

- Creates Stripe customer if needed
- Creates payment intent
- Creates payment record in database
- Returns `client_secret` for frontend checkout

✅ **Payment Queries:**

```
GET /host/payments?userId=xxx
Response: { payments: [...] }
```

- Get all payments for a user

```
GET /host/events/:eventId/payments
Response: { payments: [...] }
```

- Get all payments for an event

✅ **Webhook Endpoint:**

```
POST /webhooks/stripe
Headers: { "stripe-signature": "..." }
Body: (raw JSON from Stripe)
```

- Verifies webhook signature
- Processes payment events
- Updates payment records and linked RSVPs

✅ **Event Endpoints Updated:**

- `POST /events` - Now accepts `ticketPrice`, `stripeProductId`, `stripePriceId`
- `PUT /host/events/:id` - Can update Stripe fields

---

## 🔧 Environment Variables Needed

To enable Stripe functionality, add to your `.env` file:

```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_...  # Your Stripe secret key
STRIPE_WEBHOOK_SECRET=whsec_... # Your webhook signing secret
```

**Note:** The app will start without these, but Stripe functions will throw errors if called without them.

---

## 📋 Current Workflow

### **Payment Flow:**

1. **User RSVPs to Paid Event**

   - RSVP created with `paymentStatus: "unpaid"`

2. **Create Payment Intent**

   - Frontend calls: `POST /host/events/:eventId/create-payment`
   - Backend:
     - Gets/creates Stripe customer
     - Creates payment intent
     - Creates payment record (status: "pending")
     - Links payment to RSVP
   - Returns `client_secret` to frontend

3. **Frontend Checkout**

   - Use Stripe.js to confirm payment with `client_secret`
   - User enters card details
   - Stripe processes payment

4. **Webhook Updates**

   - Stripe sends webhook to `/webhooks/stripe`
   - Backend updates payment status
   - RSVP `paymentStatus` auto-updates to "paid"

5. **Refunds**
   - Process refund in Stripe Dashboard or via API
   - Webhook updates payment to "refunded"
   - RSVP `paymentStatus` auto-updates to "refunded"

---

## 🚧 What's NOT Yet Implemented

### **Frontend Integration:**

- ❌ Stripe.js integration in frontend
- ❌ Payment form/checkout UI
- ❌ Payment status display in event pages
- ❌ Payment history page UI

### **Advanced Features:**

- ❌ Stripe Connect (for host payouts)
- ❌ Subscription management
- ❌ Payment method management
- ❌ Customer portal integration
- ❌ Automatic refunds via API

### **Database Migration:**

- ⚠️ Currently using in-memory storage
- ⚠️ Need to migrate to Supabase when ready
- ⚠️ Schema matches guide but not in database yet

---

## 🎯 Next Steps to Complete Integration

### **1. Frontend Setup**

```bash
# Install Stripe.js in frontend
npm install @stripe/stripe-js
```

### **2. Create Payment Checkout Component**

- Use Stripe Elements or Checkout
- Call `/host/events/:eventId/create-payment`
- Confirm payment with `client_secret`
- Handle success/error states

### **3. Configure Webhook**

- In Stripe Dashboard, add webhook endpoint: `https://your-domain.com/webhooks/stripe`
- Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
- Copy webhook signing secret to `.env`

### **4. Test Payment Flow**

- Use Stripe test cards (e.g., `4242 4242 4242 4242`)
- Test successful payments
- Test failed payments
- Test refunds

### **5. Database Migration (When Moving to Supabase)**

- Create `payments` table (see `STRIPE_SUPABASE_INTEGRATION_GUIDE.md`)
- Migrate payment records
- Update functions to use Supabase instead of in-memory arrays

---

## 📚 Documentation

- **Integration Guide**: `STRIPE_SUPABASE_INTEGRATION_GUIDE.md` - Best practices and Supabase schema
- **Stripe Docs**: https://stripe.com/docs
- **Stripe Test Cards**: https://stripe.com/docs/testing

---

## ✅ Summary

**You have:**

- ✅ Complete backend payment infrastructure
- ✅ Stripe customer management
- ✅ Payment intent creation
- ✅ Webhook handling for payment events
- ✅ Payment records linked to RSVPs
- ✅ Refund tracking
- ✅ API endpoints ready for frontend

**You need:**

- ⚠️ Frontend Stripe.js integration
- ⚠️ Webhook configuration in Stripe Dashboard
- ⚠️ Environment variables set
- ⚠️ Database migration (when moving to Supabase)

The backend is **ready** for Stripe integration. You just need to connect the frontend and configure your Stripe account!
