# Widget Feature Preparation Guide (V4)

## 🎯 Quick Answer

**Most can wait**, but there are a few things worth keeping in mind now to avoid blockers later.

---

## ✅ What You Already Have (No Prep Needed)

### **1. Public Event Access**

- ✅ Events have `visibility: "public" | "private"` field
- ✅ Public endpoints exist: `GET /events/:slug`
- ✅ Events can be accessed without authentication
- ✅ CORS is configured (can be adjusted for widgets later)

### **2. Event Data Structure**

- ✅ Rich event data (title, description, dates, location, etc.)
- ✅ RSVP functionality already works publicly
- ✅ Theme support (`minimal` theme exists)

---

## 🔧 What to Keep in Mind (But Don't Build Yet)

### **1. Database Schema Planning**

When you migrate to Supabase, consider adding a `widgets` table structure:

```sql
CREATE TABLE public.widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  widget_type TEXT NOT NULL, -- 'event_list', 'single_event', 'rsvp_form', etc.
  config JSONB NOT NULL DEFAULT '{}'::jsonb, -- Flexible config storage
  embed_code TEXT UNIQUE, -- Unique code for embedding
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_widgets_user_id ON public.widgets(user_id);
CREATE INDEX idx_widgets_embed_code ON public.widgets(embed_code);
```

**Why plan now?** Just knowing this structure helps, but you don't need to create it until V4.

---

### **2. Public API Endpoints**

You'll eventually need:

```
GET /widget/:embedCode/data     - Get widget data (no auth required)
GET /widget/:embedCode/config   - Get widget config (no auth required)
POST /widget/:embedCode/rsvp    - RSVP through widget (no auth required)
```

**Current status:** Your existing public endpoints (`/events/:slug`) can work, but you might want widget-specific endpoints for better control.

**Action:** ✅ Nothing needed now - can add when building widgets.

---

### **3. CORS Configuration**

Your current CORS setup:

```javascript
app.use(cors()); // Allows all origins
```

**For widgets, you'll want:**

```javascript
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow widget embedding from any origin
      // Or restrict to specific domains if needed
      callback(null, true);
    },
    credentials: false, // Widgets typically don't need credentials
  })
);
```

**Action:** ✅ Current setup works, can refine later.

---

### **4. Security Considerations**

**Rate Limiting:**

- Widgets will be embedded on external sites
- Need rate limiting to prevent abuse
- Consider per-embed-code limits

**Action:** ⚠️ Add rate limiting when you add authentication (good practice anyway).

**Content Security:**

- Widgets should only show public events
- Respect `visibility: "private"` settings
- Don't expose sensitive user data

**Action:** ✅ Your `visibility` field already handles this.

---

## 🚫 What You DON'T Need to Do Now

### **1. Build Widget UI**

- ❌ Don't create widget builder interface yet
- ❌ Don't create embed code generator yet
- ❌ Don't create widget preview yet

### **2. Create Widget Database Tables**

- ❌ Don't create `widgets` table yet
- ❌ Don't add widget-related fields to events yet

### **3. Build Widget Rendering**

- ❌ Don't create widget React components yet
- ❌ Don't create widget iframe/page yet
- ❌ Don't create widget JavaScript SDK yet

---

## 📋 Recommended Approach

### **Phase 1: Now (Auth + Supabase + Stripe)**

Focus on:

1. ✅ Authentication (Supabase Auth)
2. ✅ Database migration (Supabase)
3. ✅ Stripe integration
4. ✅ User data persistence

**Don't worry about widgets yet.**

---

### **Phase 2: V4 (Widgets)**

When ready for widgets:

1. **Create Widget Schema**

   - Add `widgets` table to Supabase
   - Add widget management endpoints

2. **Build Widget Builder UI**

   - Widget creation interface
   - Configuration options (which events, styling, etc.)
   - Embed code generation

3. **Create Widget Rendering**

   - Public widget page/component
   - Widget JavaScript SDK (optional)
   - iframe or direct embed support

4. **Add Widget-Specific Endpoints**
   - Public API for widget data
   - Rate limiting per widget
   - Analytics tracking

---

## 🎯 Key Takeaways

### **✅ Safe to Wait:**

- Widget database tables
- Widget UI components
- Widget rendering logic
- Embed code generation

### **⚠️ Keep in Mind:**

- Your `visibility` field already supports widgets
- Public endpoints exist and work
- CORS is configured (may need refinement)
- Rate limiting should be added with auth

### **✅ Already Ready:**

- Public event access
- Event data structure
- RSVP functionality
- Theme support

---

## 💡 Pro Tips

1. **Don't Over-Engineer:** Your current architecture doesn't block widgets. Build them when you need them.

2. **Public Events Are Key:** Your `visibility: "public"` field is perfect - widgets will only show public events.

3. **Flexible Config:** When you do build widgets, use JSONB for config (as shown in schema above) - it's flexible and future-proof.

4. **Start Simple:** First widget could just be a simple event list. Add complexity later.

5. **Security First:** When you add widgets, ensure:
   - Only public events are accessible
   - Rate limiting is in place
   - No sensitive data leaks through widgets

---

## 🚀 Bottom Line

**You're in good shape!** Your current architecture supports widgets without major changes. Focus on auth, database, and Stripe now. Widgets can be a clean V4 feature built on top of your solid foundation.

The only thing worth doing now: **Keep your public endpoints clean and well-documented** - they'll be the foundation for widgets later.

---

_Last Updated: Current Date_
_Status: Ready for V4 when you are!_
