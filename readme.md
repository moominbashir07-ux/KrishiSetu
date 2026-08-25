# KrishiSetu — Live Mandi Price API

The Market Prices screen now connects to the Government of India's Open Government Data (OGD) mandi-price resource used by AGMARKNET:

- Resource: Current Daily Price of Various Commodities from Various Markets (Mandi)
- Resource ID: `9ef84268-d588-465a-a308-a864a43d0070`
- Source: Ministry of Agriculture and Farmers Welfare / Department of Agriculture and Farmers Welfare
- Fields: state, district, market, commodity, variety, grade, arrival_date, min_price, max_price, modal_price

## Run locally

1. Install Node.js 18+.
2. Open a terminal in this folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Create/get a data.gov.in API key and put it in `DATA_GOV_IN_API_KEY`.
6. Run `npm start`.
7. Open `http://localhost:3000`.

The browser calls `/api/market-prices`; the Node server keeps the API key out of the frontend.

## Price graph behavior

- The page refreshes the government feed every 5 minutes while the Market Prices screen is open.
- It plots average modal price by arrival date for the selected commodity and state.
- It calculates up/down movement against the previous returned observation.
- If the government API is unavailable, the UI shows clearly labelled demo data instead of silently presenting fake prices as live data.

### Important
The government mandi dataset is a **daily** market-price feed, not a second-by-second exchange feed. Therefore this integration provides near-live refresh of the latest official mandi observations; it does not invent intraday price ticks.


## User accounts

The frontend now has separate **Sign In** and **Create Account** flows.

- New users must choose **Create Account**, enter their name, phone/email and a password, and select Buyer or Seller.
- Existing users use **Sign In** with the same phone/email and password.
- Duplicate phone/email registrations are blocked.
- Invalid credentials are rejected instead of allowing demo login.
- Accounts and the current session are stored in browser `localStorage` for this frontend demo.
- For production deployment, replace localStorage authentication with a server-side database, hashed passwords, sessions/JWT, rate limiting and HTTPS.
