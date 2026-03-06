MONTHLY REVENUE ANALYTICS (ADMIN ONLY)

Add a fully integrated ADMIN-ONLY Monthly Revenue Analytics system to the app. This must work for each individual store and also support switching between stores. It must be clean, visual, fast, mobile-friendly, and fully wired to Supabase + offline-aware local cache. The monthly analytics must be viewable from the dashboard and from a dedicated Reports / Analytics page.

GOAL
The admin must be able to select a month and year and see:
- total monthly revenue / total monthly gross collected
- breakdown of:
  - lottery
  - bill payments
  - taxable sales
  - non-taxable sales
  - cash
  - card
  - EBT
  - other payments
  - tax collected
  - paid outs / payouts where applicable
- total number of scratch tickets sold for the month
- breakdown of scratch tickets sold by lottery/game name
- total lottery payouts / paidouts
- monthly closing count
- average daily totals
- best closing day / highest revenue day
- quick visual charts
- printable/exportable monthly PDF report
- export CSV

IMPORTANT:
This section is ADMIN ONLY.
STAFF must not be able to access monthly analytics, monthly reports, exports, or charts unless explicit granular permission is enabled in the future.
Hide this page from STAFF navigation and protect it with route guards and server-side permission checks.

MONTHLY ANALYTICS DEFINITIONS

1) MAIN TOP-LEVEL METRICS
For the selected month and active store, compute and display:
- total_gross_collected_month
- total_true_revenue_month
- total_taxable_sales_month
- total_non_taxable_sales_month
- total_tax_collected_month
- total_cash_month
- total_card_month
- total_ebt_month
- total_other_payments_month
- total_lottery_sales_month
- total_lottery_payouts_month
- total_lottery_net_month
- total_billpay_collected_month
- total_billpay_fee_revenue_month
- total_scratch_tickets_sold_month
- total_closings_count_month
- avg_daily_gross_month
- avg_daily_true_revenue_month

Define the formulas clearly and consistently with the rest of the app:

A) total_gross_collected_month =
sum of daily gross_collected
where gross_collected includes:
- product sales
- lottery sales
- billpay collected total
depending on the app’s existing included-in-gross toggles or stored final computed values

B) total_true_revenue_month =
sum of daily true_revenue
where true_revenue should clearly represent the store’s actual earned revenue view, not just pass-through money
For display clarity, show a tooltip explaining the difference between gross collected vs true revenue.

C) total_lottery_sales_month =
sum of scratch sales + draw sales

D) total_lottery_payouts_month =
sum of scratch payouts + draw payouts

E) total_lottery_net_month =
total_lottery_sales_month - total_lottery_payouts_month

F) total_billpay_collected_month =
sum of all bill payment amounts collected from customers

G) total_billpay_fee_revenue_month =
sum of the store’s earned fees/commissions from bill payments

H) total_scratch_tickets_sold_month =
sum of tickets_sold across all lottery scratch lines in the selected month

2) LOTTERY MONTHLY BREAKDOWN
Add a dedicated Monthly Lottery Breakdown section with:

A) Summary cards:
- total scratch sales
- total draw sales
- total lottery sales
- total lottery payouts
- total lottery net
- total scratch tickets sold

B) Table by lottery / game name:
Group scratch ticket data by lottery game_name (or game identifier if used)

Columns:
- lottery_name
- total_ticket_lines_count
- total_tickets_sold
- avg_ticket_price
- total_scratch_sales
- total_scratch_payouts
- total_scratch_net

Sort default:
- highest total_scratch_sales descending

C) Expandable details:
When clicking a lottery/game row, show:
- each closing date where that game was entered
- start/end numbers
- tickets sold
- ticket price
- payouts
- scratch sales
- who entered it (optional for admin)

D) Optional chart:
- bar chart of top lottery names by tickets sold
- pie chart of lottery revenue share by game name
Use clean chart cards.

3) MONTHLY PAYMENT BREAKDOWN
Add a Monthly Payment Breakdown section showing:
- cash total
- card total
- EBT total
- other total
- percentages of each payment type relative to monthly payment total

Show:
- pie chart of payment methods
- table with amount + percent

4) MONTHLY TAX BREAKDOWN
Add a Monthly Tax Breakdown section showing:
- total taxable sales
- total non-taxable sales
- total tax collected
- average daily taxable sales
- average daily tax collected

Show:
- chart comparing taxable vs non-taxable
- compact summary table

5) MONTHLY BILL PAY BREAKDOWN
Add a Monthly Bill Pay section showing:
- total billpay collected
- total fee/commission revenue
- total billpay transaction count
- optional breakdown by provider/type if billpay_lines exist

If billpay_lines exist, show table:
- provider/type
- total_collected
- total_fee_revenue
- transaction_count

6) MONTHLY DAILY PERFORMANCE TABLE
Add a daily closings table for the selected month.
Columns:
- date
- status
- gross_collected
- true_revenue
- lottery_sales
- lottery_payouts
- billpay_collected
- taxable_sales
- non_taxable_sales
- tax_amount
- cash
- card
- tickets_sold_total
- actions (view details, print PDF)

Allow admin to click a row to view full closing detail.

7) REPORT FILTERS
Add filters at top of Monthly Analytics page:
- store selector
- month selector
- year selector
- optional quick presets:
  - this month
  - last month
  - last 3 months
- optional “compare to previous month” toggle

If compare mode is enabled, show:
- difference amount
- percentage change
for key cards:
- gross collected
- true revenue
- lottery sales
- billpay collected
- tax collected
- cash/card

8) DASHBOARD INTEGRATION
On the ADMIN dashboard, add a Monthly Snapshot section/card cluster showing:
- selected month total gross
- total lottery sales
- total billpay collected
- total tax collected
- total scratch tickets sold
- top lottery/game of the month
- quick button: “Open Monthly Analytics”

Keep the dashboard clean and non-cluttered.
Use 3D cards with subtle motion, not excessive clutter.

9) DATABASE / QUERY REQUIREMENTS
Implement efficient backend queries for monthly aggregation.

Use either:
- optimized SQL views/materialized views
OR
- server-side aggregation queries with proper indexes
OR
- a hybrid approach

Must add indexes if needed on:
- closing_days(store_id, closing_date)
- lottery_scratch_lines(closing_day_id, game_name)
- billpay_lines(closing_day_id)
- store_id foreign-key-related filters

If helpful, create database views such as:
- monthly_closing_summary_view
- monthly_lottery_summary_view
- monthly_billpay_summary_view

But ensure:
- RLS still applies safely
- admin-only access is enforced by role checks and store membership

10) OFFLINE SUPPORT FOR MONTHLY ANALYTICS
Because the app is offline-capable:
- cache enough monthly data locally for previously synced months
- allow admin to view cached monthly analytics offline
- clearly show “cached data” badge if offline and data may not reflect unsynced changes from other devices
- once online, sync and refresh analytics automatically

11) PDF MONTHLY REPORT
Add a new printable/exportable Monthly Report PDF.

The monthly PDF must include:
- store header (name, address, phone, business details)
- selected month/year
- generated timestamp
- summary cards / summary section
- revenue breakdown tables
- monthly payment breakdown
- monthly tax breakdown
- lottery breakdown by game name
- total scratch tickets sold
- total lottery payouts
- charts embedded as images:
  - revenue category pie chart
  - payment method pie chart
  - top lottery names chart
- daily performance summary table
- notes section if admin wants to add a monthly note before export

Store this monthly PDF in Supabase Storage too, using a separate folder structure:
userId/storeId/reports/YYYY/MM/monthly_report_YYYY-MM_timestamp.pdf

Add a new document type:
- monthly_report_pdf

Create DB link records for stored monthly reports if needed.

12) CSV EXPORT
Add export CSV for monthly analytics.
At minimum support:
- daily closings summary CSV
- lottery breakdown CSV by game name
- payment breakdown CSV
- billpay breakdown CSV

ADMIN ONLY.

13) UI / UX REQUIREMENTS
The Monthly Analytics page must look premium and easy to scan:
- top summary cards
- charts in a clean grid
- tables below
- collapsible sections on mobile
- sticky filter bar on desktop if helpful
- dark black + crimson theme consistent with app
- subtle 3D card depth and smooth transitions
- avoid visual clutter

14) PERMISSIONS
Enforce:
- only ADMIN for that store can access monthly analytics, exports, monthly PDFs
- STAFF denied both in frontend and backend
- if STAFF manually visits the analytics URL, redirect to allowed page and show access denied message

15) TESTING
Add tests to verify:
- monthly totals are correct from daily closings
- scratch tickets sold aggregation is correct
- lottery grouping by game name works
- monthly PDF generation includes expected sections
- staff cannot access analytics routes
- offline cached monthly analytics loads correctly when available

16) IMPLEMENTATION DETAILS
Add a dedicated page such as:
- /dashboard/reports/monthly
or similar

Build reusable aggregation utilities:
- aggregateMonthlyClosingData
- aggregateMonthlyLotteryData
- aggregateMonthlyPaymentData
- aggregateMonthlyBillpayData

These must use the same calculation rules as the core nightly closing logic so numbers stay consistent everywhere.

17) IMPORTANT DISPLAY NOTE
In the UI and PDF, clearly distinguish:
- Gross Collected
- True Revenue
- Lottery Sales
- Lottery Payouts
- Lottery Net
- Billpay Collected
- Billpay Fee Revenue

Do not mix them in confusing ways.
Use helper text and labels so the admin can understand the difference instantly.

IMPLEMENT THIS MONTHLY ANALYTICS FEATURE END-TO-END:
- database/query layer
- role protection
- admin dashboard integration
- charts
- monthly tables
- scratch ticket totals by lottery name
- PDF export
- CSV export
- offline cache support
- mobile-friendly UI

Do not leave placeholders or TODOs.

END ADDITION
