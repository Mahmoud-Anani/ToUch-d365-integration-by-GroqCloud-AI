# D365 Data Analysis - Quick Reference

## At a Glance

### 📊 Total Analytics: 31 Charts
- **15 Bar Charts** - Horizontal comparisons
- **10 Donut Charts** - Part-to-whole relationships  
- **6 Column Charts** - Vertical comparisons

### 🌍 Languages: 2
- **English** - Full support
- **Arabic** - Full RTL support

### 🏢 Business Areas: 6
- Product & Inventory (2)
- Customer Management (4)
- Vendor Management (3)
- Financial Transactions (8)
- Accounts & Dimensions (6)
- System & Currency (7)

---

## Chart Quick Index

### 🛍️ Product Analytics

| # | Chart Name | Type | Field |
|---|------------|------|-------|
| 1 | Products by Type | Bar | ProductType |
| 2 | Products by Company | Column | dataAreaId |

### 👥 Customer Analytics

| # | Chart Name | Type | Field |
|---|------------|------|-------|
| 3 | Customers by Group | Bar | CustomerGroupId |
| 4 | Customers by Currency | Donut | SalesCurrencyCode |
| 5 | Customers on Hold | Donut | OnHoldStatus |
| 6 | Customers by Company | Column | dataAreaId |

### 🏭 Vendor Analytics

| # | Chart Name | Type | Field |
|---|------------|------|-------|
| 7 | Vendors by Group | Bar | VendorGroupId |
| 8 | Vendors by Currency | Donut | CurrencyCode |
| 9 | Vendors by Company | Column | dataAreaId |

### 💰 Financial Transactions

| # | Chart Name | Type | Field |
|---|------------|------|-------|
| 10 | Invoices by Status | Bar | IsPosted |
| 11 | Top Invoice Customers | Bar | CustomerAccount |
| 12 | Ledger by Status | Bar | IsPosted |
| 13 | Ledger by Name | Column | JournalName |
| 14 | Ledger by Currency | Donut | AccountingCurrency |
| 15 | Payments by Status | Bar | IsPosted |
| 16 | Payments by Journal | Column | JournalName |
| 17 | Expenses by Status | Bar | IsPosted |
| 18 | Expenses by Approver | Column | ApprovedBy |

### 📒 Accounts & Dimensions

| # | Chart Name | Type | Field |
|---|------------|------|-------|
| 19 | Accounts by Type | Column | MainAccountType |
| 20 | Accounts by Currency | Donut | DefaultCurrency |
| 21 | Accounts Suspension | Donut | IsSuspended |
| 22 | Dimensions by Entity | Bar | LegalEntityId |
| 23 | Dimensions by Type | Column | FinancialDimension |
| 24 | Dimensions Suspension | Donut | IsSuspended |

### 💱 Currency Management

| # | Chart Name | Type | Field |
|---|------------|------|-------|
| 25 | Rates by Type | Donut | RateTypeName |
| 26 | Rates from Currency | Bar | FromCurrency |
| 27 | Rates to Currency | Bar | ToCurrency |

### ⚙️ System Governance

| # | Chart Name | Type | Field |
|---|------------|------|-------|
| 28 | Users by Language | Bar | Language |
| 29 | Users by Company | Column | Company |

### 📁 Group Distribution

| # | Chart Name | Type | Field |
|---|------------|------|-------|
| 30 | Customer Groups | Column | dataAreaId |
| 31 | Vendor Groups | Column | dataAreaId |

---

## Common Tasks

### View Dashboard
```
Navigate to: http://localhost:3000
Click: Dashboard tab (default view)
```

### Refresh Data
```
Click: "Refresh" button in dashboard header
Wait: 5-15 seconds for all charts to reload
```

### Switch Language
```
Click: Language toggle button (العربية / English)
Effect: All charts and labels switch instantly
```

### View Chart Details
```
Hover: Over chart sections for details
Check: Group count and percentage shown
Note: Completion status (Complete/Partial)
```

---

## Configuration Quick Start

### Basic Setup (.env)
```env
# D365 Connection (Required)
D365_BASE_URL=https://your-environment.operations.dynamics.com
D365_CLIENT_ID=your-client-id
D365_CLIENT_SECRET=your-secret
D365_TENANT_ID=your-tenant-id

# AI Provider (Required for chat)
GROQ_API_KEY=your-groq-key
GROQ_MODEL=openai/gpt-oss-120b

# Analytics (Optional - shown with defaults)
D365_ANALYTICS_MAX_ROWS=5000
D365_PAGE_SIZE=500
AI_MAX_GROUPS=50
```

### Performance Tuning

**Faster Loading (Less Accurate)**
```env
D365_ANALYTICS_MAX_ROWS=1000
D365_PAGE_SIZE=200
AI_MAX_GROUPS=20
```

**Complete Scans (Slower)**
```env
D365_ANALYTICS_MAX_ROWS=10000
D365_PAGE_SIZE=1000
AI_MAX_GROUPS=100
```

---

## Troubleshooting

### Problem: Charts not loading
```
✓ Check: GET /api/health endpoint
✓ Verify: D365 connection in sidebar
✓ Try: Manual metadata refresh
✓ Check: Browser console for errors
```

### Problem: Slow dashboard load
```
✓ Reduce: D365_ANALYTICS_MAX_ROWS
✓ Lower: D365_PAGE_SIZE  
✓ Check: Network tab for slow D365 responses
✓ Verify: D365 isn't throttling requests
```

### Problem: Partial scan warnings
```
✓ Increase: D365_ANALYTICS_MAX_ROWS
✓ Note: This is expected for very large datasets
✓ Consider: Using filters to reduce data volume
```

### Problem: Entity unavailable
```
✓ Check: Entity permissions in D365
✓ Verify: Entity is published in D365
✓ Try: Metadata refresh
✓ Note: Other charts continue to work
```

---

## API Endpoints

### Get Dashboard Overview
```http
GET /api/dashboard/overview
Response: Module counts and availability
```

### Get Data Analysis
```http
GET /api/dashboard/analysis
Response: All 33 breakdowns with chart data
```

### Check System Health
```http
GET /api/health
Response: D365 status, AI status, metadata status
```

### Refresh Metadata
```http
POST /api/metadata/refresh
Response: Updated entity catalog
```

---

## Performance Metrics

### Expected Load Times

| Dataset Size | Initial Load | Cached Load |
|-------------|--------------|-------------|
| Small (< 1K records) | 3-5 sec | < 1 sec |
| Medium (1K-10K) | 5-10 sec | < 1 sec |
| Large (> 10K) | 10-15 sec | < 1 sec |

### Resource Usage

| Metric | Typical | Maximum |
|--------|---------|---------|
| Memory | 50-100 MB | 200 MB |
| CPU | 5-10% avg | 50% peak |
| Network | 33 requests | 33 requests |
| D365 Load | 5 concurrent | 5 concurrent |

---

## Security Notes

### ✅ Safe Operations
- All analytics are **read-only**
- No data modifications possible
- No business process impact
- Audit-trail friendly

### ⚠️ Access Control
- Requires D365 integration identity
- Respects D365 entity permissions
- Uses secure OAuth authentication
- Server-side credentials only

---

## Support Checklist

Before requesting support:

- [ ] Check `GET /api/health` status
- [ ] Review browser console errors
- [ ] Check server logs (LOG_LEVEL=debug)
- [ ] Test D365 connection: `npm run smoke:d365`
- [ ] Verify metadata: `GET /api/metadata/status`
- [ ] Try manual refresh
- [ ] Test in different browser
- [ ] Check `.env` configuration

---

## Quick Commands

```bash
# Development
npm run dev              # Start dev server with hot reload

# Production
npm run build           # Build for production
npm start               # Start production server

# Testing
npm test                # Run test suite
npm run typecheck       # Check TypeScript types
npm run lint            # Run ESLint

# Diagnostics
npm run smoke:d365      # Test D365 connection
npm run smoke:groq      # Test AI provider
```

---

## File Locations

### Configuration
- `.env` - Environment variables
- `package.json` - Dependencies
- `tsconfig.json` - TypeScript config

### Source Code
- `src/dashboard/service.ts` - Analytics logic
- `src/analytics/analytics.ts` - Core engine
- `src/dashboard/modules.ts` - Module definitions

### Frontend
- `public/index.html` - Dashboard UI
- `public/app.js` - Chart rendering
- `public/styles.css` - Styling

### Documentation
- `README.md` - Main docs
- `DATA_ANALYSIS_ENHANCEMENTS.md` - Detailed guide
- `ENHANCEMENT_SUMMARY.md` - Change summary
- `QUICK_REFERENCE.md` - This file

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `L` | Toggle language (EN/AR) |
| `T` | Toggle theme (Light/Dark) |
| `R` | Refresh dashboard |
| `M` | Toggle sidebar menu |
| `Esc` | Close modals/overlays |

---

## Status Indicators

| Icon | Meaning |
|------|---------|
| 🟢 | Live data, complete scan |
| 🟡 | Live data, partial scan |
| 🔴 | Entity unavailable |
| ⚪ | Loading... |

---

## Best Practices

### For Users
1. ✅ Refresh dashboard after D365 changes
2. ✅ Check completion status on charts
3. ✅ Use language that matches your preference
4. ✅ Monitor status indicators

### For Administrators
1. ✅ Set appropriate scan limits
2. ✅ Monitor D365 throttling
3. ✅ Configure entity permissions
4. ✅ Enable audit logging
5. ✅ Schedule metadata refresh

### For Developers
1. ✅ Follow TypeScript types
2. ✅ Test with smoke scripts
3. ✅ Check logs before deploying
4. ✅ Maintain bilingual support
5. ✅ Document configuration changes

---

**Version**: 2.0.0  
**Updated**: November 2026  
**Status**: Production Ready ✅
