# 🌾 KrishiSetu — Direct Farm-to-Customer Agricultural Marketplace

KrishiSetu is a modern, production-ready agricultural marketplace and commodity price intelligence system that connects local farmers directly with consumers while delivering live government mandi arrival rates (AGMARKNET / Data.gov.in).

---

## 🌟 Key Features

- **Authoritative Stitch AgriCore Design:** Single unified interface built with responsive HTML5, TailwindCSS, and Inter typography.
- **Public Hero Landing & Role Routing:** Clean hero landing page for public visitors ("From Farm to Customer, Without the Middleman"). Logged-in Buyers open the Produce Marketplace; Sellers open the Seller Dashboard. Role routing is strictly determined by the authenticated database user.
- **EmailJS OTP Authentication:** Secure 6-digit OTP codes dispatched directly to user inboxes via EmailJS. Strict format validation prevents invalid inputs.
- **Dedicated Cart Architecture:** Clicking `ADD TO CART` adds items to the server database cart. Items are reviewed on the dedicated Cart page (`#cart`) with server-calculated platform fees (0.5% for bulk orders ≥ ₹5,000 / 100 kg+; 2.0% for normal orders).
- **Product Photo Uploads:** Sellers upload product photos with live thumbnail previews. Images persist in the database and render on produce cards, cart items, and order details.
- **Mandi Market Intelligence Terminal:** AGMARKNET live arrival price observations, modal price trends, canvas line chart, and mandi comparison records.
- **Geolocation & Haversine Distance:** Detects user GPS coordinates and computes relative farmer-to-buyer distances (e.g. `📍 1.2 km away`).

---

## 🛠 Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** Supabase PostgreSQL (with embedded relational fallback engine for local offline operation)
- **Authentication:** JWT, bcryptjs password hashing, EmailJS email OTP
- **Frontend:** HTML5, Vanilla JavaScript, TailwindCSS, KaTeX, Material Symbols
- **Testing:** Node.js native test runner (`node --test tests/*.test.js`)

---

## 🚀 Environment Variables (`.env`)

Configure the following environment variables in your production environment (e.g. Render, Railway, or Vercel):

```ini
# Server Configuration
PORT=3000
NODE_ENV=production
APP_URL=https://your-production-app.onrender.com

# Supabase / PostgreSQL Production Database
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.swxwtwxaoxuucjjdttdr.supabase.co:5432/postgres

# Security Secrets
JWT_SECRET=your_super_secret_jwt_key_here
ADMIN_BOOTSTRAP_KEY=krishisetu_admin_seed_secret_2026

# Government Mandi API Key (data.gov.in)
DATA_GOV_IN_API_KEY=579b464db66ec23bdd0000019cce4e7900cb46714270c3f2f0723216

# EmailJS OTP Integration
EMAIL_OTP_PROVIDER=emailjs
EMAILJS_PUBLIC_KEY=czyv3jAfR0Ie75oKe
EMAILJS_SERVICE_ID=service_9kbwben
EMAILJS_TEMPLATE_ID=template_2xxvycw
EMAIL_FROM=no-reply@krishisetu.org

# Supabase Credentials (Optional API Access)
SUPABASE_URL=https://swxwtwxaoxuucjjdttdr.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

---

## 💻 Local Development & Testing

```bash
# 1. Install dependencies
npm install

# 2. Run automated test suite (45/45 tests)
npm test

# 3. Start local server
npm start
```

Access the local server at `http://localhost:3000/`.

---

## ☁ Cloud Production Deployment Guide

### Deploying to Render (Recommended Node.js Web Service)
1. Log in to [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository: `https://github.com/moominbashir07-ux/KrishiSetu.git`.
4. Configure service settings:
   - **Name:** `krishisetu-marketplace`
   - **Environment:** `Node`
   - **Branch:** `main`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Add Environment Variables under **Environment**:
   - Add `DATABASE_URL`, `JWT_SECRET`, `DATA_GOV_IN_API_KEY`, `EMAIL_OTP_PROVIDER`, `EMAILJS_PUBLIC_KEY`, `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, and `APP_URL` (`https://krishisetu-marketplace.onrender.com`).
6. Click **Create Web Service**. Render will build and deploy the live HTTPS URL.

---

## 📜 Credits & License

Made with ❤️ by **Code Red**.
