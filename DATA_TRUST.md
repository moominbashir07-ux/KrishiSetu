# KrishiSetu 2.0 — Data Trust & Provenance Protocol

## 1. Context & Judge Feedback Addressed

During the previous Smart India Hackathon (SIH) review, the judging panel raised critical questions:
1. *Why should anyone believe the market-price graph is accurate?*
2. *What exact time period does the chart represent?*
3. *Where does this market data originate from?*
4. *How is stale data handled on days when mandis are closed?*

KrishiSetu 2.0 treats market data with the seriousness of financial market data. This protocol governs the acquisition, validation, timestamping, and transparent presentation of commodity rates.

---

## 2. Market Data Ingestion Strategy

```
+-----------------------------------------------------------------------------------------+
|                               UPSTREAM DATA SOURCES                                     |
|                                                                                         |
|   1. AGMARKNET / data.gov.in                                                            |
|      - API Endpoint: https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070|
|      - Real-time arrival rates across 3,000+ regulated APMCs                            |
|                                                                                         |
|   2. e-NAM (National Agriculture Market) Portal Bulletin (Secondary)                    |
|      - Official daily trade records                                                     |
|                                                                                         |
|   3. Development Mock Adapter (Local Testing Only)                                      |
|      - Clearly isolated, never mixed into production persistence                        |
+-----------------------------------------------------------------------------------------+
                                             │
                                             ▼
+-----------------------------------------------------------------------------------------+
|                              INGESTION & VALIDATION ENGINE                              |
|                                                                                         |
|   - Strip non-numeric artifacts                                                         |
|   - Validate Price Sanity: Min Price <= Modal Price <= Max Price                        |
|   - Canonicalize Commodity Names (e.g. "Onion (Nashik)" -> "Onion")                     |
|   - Compute Arrival Freshness against observation timestamp                             |
|   - Stamp Metadata: Source ID, Publisher, Resource ID, Fetch Timestamp                  |
+-----------------------------------------------------------------------------------------+
                                             │
                                             ▼
+-----------------------------------------------------------------------------------------+
|                            KRISHISETU MARKET INTELLIGENCE API                           |
|                                                                                         |
|   Returns standard payload contract with mandatory attribution & freshness flags        |
+-----------------------------------------------------------------------------------------+
```

---

## 3. The Market Data Contract

Every single price point served by KrishiSetu 2.0 must conform to the following contract:

```typescript
export interface MarketPriceRecord {
  // Agricultural identifiers
  commodity: string;          // e.g. "Onion"
  variety: string;            // e.g. "Red Onion"
  grade: string;              // e.g. "FAQ" (Fair Average Quality)

  // Geographic coordinates
  market: string;             // e.g. "Lasalgaon APMC"
  district: string;           // e.g. "Nashik"
  state: string;              // e.g. "Maharashtra"

  // Pricing metrics
  minPrice: number;           // Minimum observed lot rate (INR per unit)
  maxPrice: number;           // Maximum observed lot rate (INR per unit)
  modalPrice: number;         // Most frequent trade rate (INR per unit)
  unit: 'quintal' | 'kg';     // Mandi arrival rates are always standardized to 'quintal'

  // Provenance and timestamps
  observedDate: string;       // "YYYY-MM-DD" when the physical auction occurred
  timePeriod: string;         // e.g. "2026-09-16 06:00 to 14:00 IST"
  fetchedAt: string;          // ISO 8601 timestamp of platform ingestion
  dataFreshness: 'LIVE' | 'RECENT' | 'STALE';
  
  // Attribution & verification
  source: {
    id: string;               // e.g. "SRC_DATAGOVIN_AGMARKNET"
    name: string;             // "data.gov.in / AGMARKNET"
    resourceId?: string;      // "9ef84268-d588-465a-a308-a864a43d0070"
    publisher: string;        // "Ministry of Agriculture and Farmers Welfare, Govt of India"
    termsOfUse: string;       // "NDSAP Open Data License"
  };

  // Mock flag
  isMock: boolean;            // true if generated for local testing; false in live environment
}
```

---

## 4. Freshness Calculation Rules

Agricultural mandis operate on morning auction cycles and are typically closed on Sundays and public holidays. Freshness is determined mathematically:

$$\Delta T = \text{CurrentTimestamp} - \text{ObservedDateTimestamp}$$

| Status | Condition | UI Indicator | Interpretation |
| :--- | :--- | :--- | :--- |
| **`LIVE`** | $\Delta T \le 24\text{ hours}$ | 🟢 **LIVE** (Green Badge) | Data represents today's morning auction session. |
| **`RECENT`** | $24\text{ hours} < \Delta T \le 48\text{ hours}$ | 🟡 **RECENT** (Amber Badge) | Data represents yesterday's trading session (or weekend carryover). |
| **`STALE`** | $\Delta T > 48\text{ hours}$ | 🔴 **STALE** (Muted Gray Badge) | No recent auctions recorded for this commodity at this mandi. Price is purely reference historical. |

**UI Display Mandate**:
The UI must NEVER render a market card without prominently stating:
- `Source: data.gov.in / AGMARKNET`
- `Observed Auction Date: 16 Sep 2026`
- `Freshness: LIVE`
- `Unit: ₹ / Quintal (100 kg)`

---

## 5. Mock Data Policy (Non-Negotiable)

In earlier iterations of KrishiSetu v1.0, when the `DATA_GOV_IN_API_KEY` was missing, the server fell back to a math generator (`getDemoMarketRecords`) and saved those synthetic records directly into the `market_price_snapshots` database table. **This practice is strictly prohibited in KrishiSetu 2.0.**

### Rules for Development Mock Data:
1. **Prominent Flagging**: Any mock record MUST have:
   ```json
   {
     "isMock": true,
     "source": {
       "id": "SRC_MOCK_DEV",
       "name": "MOCK DATA — DEVELOPMENT ONLY",
       "publisher": "KrishiSetu Development Adapter"
     }
   }
   ```
2. **Zero Production Database Contamination**: Mock records generated in local development must NEVER be written to production DynamoDB snapshots or long-term historical tables.
3. **Transparent Banner in UI**: Whenever mock data is being displayed, the frontend must render an unmistakable warning banner:
   > ⚠️ **DEVELOPMENT MODE — MOCK DATA**: The market rates below are generated by the local development adapter for testing purposes. They do not represent live government mandi rates.

---

## 6. Time Range Selection & Chart Accuracy

When plotting price trends over time:
- **7-Day View**: Displays daily modal prices from the past 7 observed auction days.
- **15-Day View**: Displays 15-day trends with explicit markers for days when markets were closed.
- **30-Day View**: Displays monthly price trajectory.

**Integrity Guarantee**:
- If a mandi was closed on Sunday or a festival day, the chart will NOT interpolate or invent a price for that day. It will cleanly show an unobserved gap or connect known points with a dashed line clearly labeled *"Market Closed / No Auction"*.
- The X-axis must always render explicit calendar dates (`10 Sep`, `11 Sep`, `12 Sep`), never generic placeholders like `Day 1`, `Day 2`.
