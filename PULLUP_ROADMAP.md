# PullUp Development Roadmap

**Current Version:** 2.0  
**Status:** Production Ready (In-Memory)

---

## Version 2.0 ✅ (COMPLETED)

### Completed Features

- ✅ **Dynamic Party Composition System (DPCS)** - Core system implemented and documented
- ✅ **RSVP Status Model** - Booking status, dinner booking status, pull-up status
- ✅ **Capacity Management** - Cocktail and dinner capacity tracking
- ✅ **Check-In System** - Separate tracking for dinner and cocktails-only arrivals
- ✅ **All-or-Nothing Waitlist** - Entire booking goes to waitlist if capacity exceeded
- ✅ **Guest Management** - Edit, delete, check-in functionality
- ✅ **Event Management** - Create, edit, manage events
- ✅ **CRM System** - Contact management with event history
- ✅ **Comprehensive Documentation** - System documentation v2.0

---

## Pre-v3.0 Checklist

### 🔍 1. Waitlist Experience - Edge Cases

**Status:** ⏳ Pending

#### Edge Cases to Test:

- [ ] **Cocktail capacity full, dinner available**

  - User books dinner party → Should go to waitlist for cocktails
  - User books cocktails-only → Should go to waitlist
  - Verify all-or-nothing behavior

- [ ] **Dinner capacity full, cocktails available**

  - User books dinner party → Should go to waitlist for dinner
  - User books cocktails-only → Should be confirmed
  - Verify all-or-nothing behavior

- [ ] **Both capacities full**

  - Any booking → Should go to waitlist
  - Verify clear messaging

- [ ] **Waitlist disabled, capacity exceeded**

  - Should show error, not allow booking
  - Verify clear error message

- [ ] **Dinner slot full, other slots available**

  - User selects full slot → Should go to waitlist
  - User selects available slot → Should be confirmed
  - Verify slot-specific waitlist logic

- [ ] **Capacity opens up (manual test)**

  - Admin cancels RSVP → Capacity opens
  - Next waitlisted user → Should be auto-confirmed? (or manual?)
  - Verify waitlist queue behavior

- [ ] **Multiple bookings on waitlist**
  - Verify order (FIFO?)
  - Verify display in admin view
  - Verify notification when spots open

**Files to Review:**

- `backend/src/data.js` - `addRsvp()`, `updateRsvp()`
- `frontend/src/components/EventCard.jsx` - Waitlist UI
- `frontend/src/pages/EventGuestsPage.jsx` - Waitlist display

---

### 🔍 2. Full API Integration Audit

**Status:** ⏳ Pending

#### Pages to Audit:

- [ ] **Home Page (`/home`)**

  - [ ] Events list (upcoming/past toggle)
  - [ ] Event cards display correct data
  - [ ] Create event button works
  - [ ] Profile header (editable picture)
  - [ ] Settings tab - all fields save correctly
  - [ ] CRM tab - contacts display correctly
  - [ ] Event history per contact

- [ ] **Create Event Page (`/create`)**

  - [ ] All fields save correctly
  - [ ] Capacity calculations correct
  - [ ] Dinner settings work
  - [ ] Stripe product/price creation (if paid)
  - [ ] Image upload works
  - [ ] Form validation

- [ ] **Public Event Page (`/e/:slug`)**

  - [ ] Event details display correctly
  - [ ] Capacity display accurate
  - [ ] RSVP form works
  - [ ] Waitlist logic works
  - [ ] Real-time capacity updates
  - [ ] Success/waitlist messages

- [ ] **Manage Event Page (`/app/events/:id/manage`)**

  - [ ] **Overview Tab**
    - [ ] Stats calculations correct
    - [ ] Capacity displays correct
    - [ ] Pull-up counts correct
    - [ ] Dinner slot stats correct
  - [ ] **Guests Tab**
    - [ ] Guest list displays correctly
    - [ ] Filtering works
    - [ ] Sorting works
    - [ ] Edit guest modal works
    - [ ] Delete guest works
    - [ ] Check-in modal works
    - [ ] Pull-up counts update correctly
  - [ ] **Edit Tab**
    - [ ] All fields update correctly
    - [ ] Capacity recalculates
    - [ ] Dinner settings update
    - [ ] Image updates

- [ ] **CRM Page (`/home/crm`)**
  - [ ] Contact list displays correctly
  - [ ] No duplicates
  - [ ] Event history per contact
  - [ ] Stats per contact (events, dinners, guests)

**API Endpoints to Verify:**

- [ ] `GET /host/events` - Returns all events
- [ ] `GET /host/events/:eventId` - Returns event details
- [ ] `POST /host/events` - Creates event
- [ ] `PUT /host/events/:eventId` - Updates event
- [ ] `DELETE /host/events/:eventId` - Deletes event
- [ ] `GET /host/events/:eventId/rsvps` - Returns all RSVPs
- [ ] `PUT /host/events/:eventId/rsvps/:rsvpId` - Updates RSVP
- [ ] `DELETE /host/events/:eventId/rsvps/:rsvpId` - Deletes RSVP
- [ ] `GET /host/people` - Returns all contacts
- [ ] `GET /events/:slug` - Returns public event
- [ ] `POST /events/:slug/rsvp` - Creates RSVP
- [ ] `GET /events/:slug/dinner-slots` - Returns dinner slots

**Data Persistence:**

- [ ] All data persists in in-memory storage
- [ ] Data survives server restart? (No - expected until Supabase)
- [ ] Verify data structure matches documentation

---

### 🔍 3. Unique Slug Generation

**Status:** ⏳ Pending

#### Options:

**Option A: Simple (Pre-Supabase)**

- Generate slug from title: `title.toLowerCase().replace(/\s+/g, '-')`
- Add random suffix if duplicate: `title-slug-abc123`
- Check against existing events

**Option B: Supabase (Post-Supabase)**

- Use Supabase's unique constraint
- Auto-generate slug with collision handling
- Database-level uniqueness

**Recommendation:** Implement Option A now, migrate to Option B with Supabase.

**Implementation:**

- [ ] Create `generateUniqueSlug(title, existingSlugs)` function
- [ ] Use in `createEvent()` backend function
- [ ] Add validation for slug format
- [ ] Test duplicate handling

**Files to Update:**

- `backend/src/data.js` - `createEvent()` function
- `frontend/src/pages/CreateEventPage.jsx` - Slug preview/display

---

### 🔍 4. Supabase Connection

**Status:** ⏳ Pending

#### Setup Steps:

- [ ] Create Supabase project
- [ ] Get connection string and API keys
- [ ] Install Supabase client libraries
- [ ] Create database schema (from `SCHEMA_VERIFICATION.md`)
- [ ] Migrate in-memory data structure to Supabase tables
- [ ] Update backend to use Supabase instead of in-memory arrays
- [ ] Test all CRUD operations
- [ ] Verify data integrity

**Tables to Create:**

1. **`people`**

   - `id` (UUID, primary key)
   - `email` (text, unique, indexed)
   - `name` (text, nullable)
   - `created_at` (timestamptz)
   - `stripe_customer_id` (text, nullable)

2. **`events`**

   - All event fields from documentation
   - `slug` (text, unique, indexed)
   - `host_id` (UUID, foreign key to users)

3. **`rsvps`**

   - All RSVP fields from documentation
   - `event_id` (UUID, foreign key)
   - `person_id` (UUID, foreign key)
   - `party_size` (integer)
   - `booking_status` (text)
   - `dinner` (JSONB)
   - Indexes on `event_id`, `person_id`, `booking_status`

4. **`payments`** (if using Stripe)
   - Payment tracking fields
   - Links to RSVPs

**Files to Update:**

- `backend/src/data.js` - Replace in-memory arrays with Supabase queries
- `backend/src/index.js` - Add Supabase client initialization
- Create migration scripts

**Documentation:**

- Update `PULLUP_SYSTEM_DOCUMENTATION_V2.md` with Supabase schema
- Document migration process

---

### 🔍 5. Authentication (Supabase Auth + Gmail)

**Status:** ⏳ Pending

#### Setup Steps:

- [ ] Enable Google OAuth in Supabase dashboard
- [ ] Configure OAuth credentials (Google Cloud Console)
- [ ] Add redirect URLs
- [ ] Install Supabase Auth helpers
- [ ] Create auth context/provider in frontend
- [ ] Protect routes (host routes require auth)
- [ ] Add login/logout UI
- [ ] Test Gmail login flow
- [ ] Verify user session persistence
- [ ] Add user profile management

**Frontend Routes to Protect:**

- [ ] `/home` - Require auth
- [ ] `/create` - Require auth
- [ ] `/app/events/:id/manage` - Require auth + ownership
- [ ] All `/host/*` API routes - Require auth

**Public Routes (No Auth):**

- [ ] `/` - Landing page
- [ ] `/e/:slug` - Public event page
- [ ] `POST /events/:slug/rsvp` - Public RSVP

**Files to Create/Update:**

- `frontend/src/contexts/AuthContext.jsx` - Auth context
- `frontend/src/components/ProtectedRoute.jsx` - Route protection
- `frontend/src/components/LoginButton.jsx` - Login UI
- `backend/src/middleware/auth.js` - Auth middleware
- `backend/src/index.js` - Add auth middleware to protected routes

**Database Updates:**

- [ ] Link `events.host_id` to `auth.users.id`
- [ ] Add RLS (Row Level Security) policies
- [ ] Users can only see/edit their own events

---

### 🔍 6. Full Testing with Supabase + Auth

**Status:** ⏳ Pending

#### Test Scenarios:

- [ ] **User Registration/Login**

  - [ ] Gmail login works
  - [ ] Session persists
  - [ ] Logout works

- [ ] **Event Management**

  - [ ] Create event (with auth)
  - [ ] Edit own event
  - [ ] Cannot edit others' events
  - [ ] Delete own event
  - [ ] View own events only

- [ ] **RSVP Flow**

  - [ ] Public RSVP works (no auth)
  - [ ] RSVP data saves to Supabase
  - [ ] Capacity updates correctly
  - [ ] Waitlist works

- [ ] **Guest Management**

  - [ ] View guests (with auth)
  - [ ] Edit guests
  - [ ] Check-in guests
  - [ ] Delete guests

- [ ] **Data Persistence**

  - [ ] Data survives server restart
  - [ ] Data persists across sessions
  - [ ] No data loss

- [ ] **Performance**
  - [ ] API response times acceptable
  - [ ] Database queries optimized
  - [ ] No N+1 queries

---

## Version 3.0 - Deployment

### 🚀 Deployment Checklist

#### 1. GitHub Setup

- [ ] Create GitHub repository
- [ ] Initialize git (if not done)
- [ ] Add `.gitignore` (node_modules, .env, etc.)
- [ ] Create `README.md` with setup instructions
- [ ] Push code to GitHub
- [ ] Set up branch protection (main/master)

#### 2. DigitalOcean Droplet Setup

- [ ] Create DigitalOcean account
- [ ] Create new droplet (Ubuntu 22.04 LTS)
  - Recommended: 2GB RAM, 1 vCPU (minimum)
  - Add SSH key
- [ ] Note IP address
- [ ] SSH into droplet

#### 3. Domain Configuration (one.com)

- [ ] Log into one.com domain manager
- [ ] Add A record: `@` → DigitalOcean IP
- [ ] Add A record: `admin` → DigitalOcean IP (subdomain)
- [ ] Wait for DNS propagation (up to 48 hours, usually < 1 hour)

#### 4. Server Setup (SSH into droplet)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (v18 or v20 LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install nginx
sudo apt install -y nginx

# Install PM2 globally
sudo npm install -g pm2

# Install Git (if not already installed)
sudo apt install -y git

# Clone repository
git clone <your-github-repo-url> /var/www/pullup
cd /var/www/pullup
```

#### 5. Backend Setup

```bash
# Navigate to backend
cd /var/www/pullup/backend

# Install dependencies
npm install

# Create .env file
nano .env
# Add:
# PORT=3001
# SUPABASE_URL=your_supabase_url
# SUPABASE_ANON_KEY=your_supabase_anon_key
# SUPABASE_SERVICE_KEY=your_supabase_service_key
# STRIPE_SECRET_KEY=your_stripe_secret_key (if using)
# CORS_ORIGIN=https://yourdomain.com

# Test backend
npm start
# Should start on port 3001
```

#### 6. Frontend Setup

```bash
# Navigate to frontend
cd /var/www/pullup/frontend

# Install dependencies
npm install

# Create .env file
nano .env
# Add:
# VITE_API_BASE=https://yourdomain.com/api
# VITE_SUPABASE_URL=your_supabase_url
# VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Build frontend
npm run build
# Creates dist/ folder
```

#### 7. Nginx Configuration

```bash
# Create nginx config
sudo nano /etc/nginx/sites-available/pullup

# Add configuration:
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Frontend
    location / {
        root /var/www/pullup/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Enable site
sudo ln -s /etc/nginx/sites-available/pullup /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 8. SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal (should be automatic)
sudo certbot renew --dry-run
```

#### 9. PM2 Setup

```bash
# Navigate to backend
cd /var/www/pullup/backend

# Create PM2 ecosystem file
nano ecosystem.config.js
# Add:
module.exports = {
  apps: [{
    name: 'pullup-backend',
    script: 'src/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
}

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow instructions shown
```

#### 10. Admin Subdomain Setup

```bash
# Create nginx config for admin subdomain
sudo nano /etc/nginx/sites-available/pullup-admin

# Add configuration:
server {
    listen 80;
    server_name admin.yourdomain.com;

    # Frontend (same build, different access)
    location / {
        root /var/www/pullup/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Enable site
sudo ln -s /etc/nginx/sites-available/pullup-admin /etc/nginx/sites-enabled/
sudo certbot --nginx -d admin.yourdomain.com
sudo systemctl restart nginx
```

#### 11. Environment Variables

```bash
# Backend .env (already created, verify)
cd /var/www/pullup/backend
nano .env
# Ensure all production values are set

# Frontend .env (already created, verify)
cd /var/www/pullup/frontend
nano .env
# Ensure API_BASE points to production domain
```

#### 12. Final Testing

- [ ] **Public Site** (`https://yourdomain.com`)

  - [ ] Landing page loads
  - [ ] Public event page works (`/e/:slug`)
  - [ ] RSVP form works
  - [ ] No CORS errors

- [ ] **Admin Site** (`https://admin.yourdomain.com`)

  - [ ] Login works (Gmail)
  - [ ] Dashboard loads
  - [ ] Create event works
  - [ ] Manage event works
  - [ ] All features functional

- [ ] **API** (`https://yourdomain.com/api`)

  - [ ] All endpoints respond
  - [ ] Authentication works
  - [ ] Data persists
  - [ ] No errors in logs

- [ ] **Performance**
  - [ ] Page load times acceptable
  - [ ] API response times acceptable
  - [ ] No memory leaks

#### 13. Monitoring & Maintenance

- [ ] Set up PM2 monitoring: `pm2 monit`
- [ ] Set up log rotation
- [ ] Set up backup strategy (Supabase backups)
- [ ] Monitor server resources
- [ ] Set up uptime monitoring (optional: UptimeRobot)

---

## Version 4.0 - Production Ready ✅

**Status:** ⏳ Pending (After v3.0 deployment)

### Success Criteria

- ✅ Fully working PullUp on HTTPS domain
- ✅ Admin subdomain functional
- ✅ Gmail authentication working
- ✅ Unique slug generation working
- ✅ Public event links work
- ✅ System works fluidly live
- ✅ All data persists in Supabase
- ✅ All features tested and working

---

## Post-v4.0: Feature Decisions

### Option A: Email Notifications

**Features:**

- RSVP confirmation emails
- Waitlist notification emails
- Event reminder emails
- Check-in notifications

**Implementation:**

- Use Supabase Edge Functions or external service (SendGrid, Resend)
- Email templates
- Queue system for bulk emails

### Option B: Stripe Ticket Payments

**Features:**

- Paid event tickets
- Stripe Checkout integration
- Payment confirmation
- Refund handling

**Implementation:**

- Stripe Checkout Sessions (already partially implemented)
- Webhook handling for payment status
- Link payments to RSVPs
- Payment history

**Decision:** To be made after v4.0 launch.

---

## Notes

- **In-Memory Storage**: Current v2.0 uses in-memory arrays. Data does NOT persist across server restarts. This is expected until Supabase is connected.

- **Testing**: Test thoroughly at each stage before moving to the next.

- **Backups**: Once Supabase is connected, set up regular backups.

- **Security**:

  - Never commit `.env` files
  - Use environment variables for all secrets
  - Enable RLS in Supabase
  - Use HTTPS everywhere

- **Documentation**: Update documentation as features are added/changed.

---

**Last Updated:** December 2024  
**Current Phase:** Pre-v3.0 Development
