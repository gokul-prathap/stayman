# Linen, supplies and operating expenses

## Expense workflow and financial reports (migration 031)

Apply [202610230031_expense_reports.sql](../supabase/migrations/202610230031_expense_reports.sql)
in Supabase SQL Editor after migration 030, then deploy the frontend. No Edge
Function deployment is needed. The migration creates a private `expense-receipts`
bucket and carries existing paid bills into the payment ledger once. It is safe
to rerun. Do not reapply older expense/workspace migrations afterward: their RPC
definitions would replace the new ledger-aware implementations.

### Staff workflow

1. Choose **Add expense** (or the quick expense button), enter amount and category,
   then explicitly choose **Paid**, **Partly paid**, or **Pay later**.
2. Bill date defaults to today. Paid entries request payment date/method; unpaid
   and partial bills can have a due date. Notes and suppliers are optional.
3. Expand **More details** for receipt photo/PDF (maximum 5 MB), staff payer,
   electricity kWh/billing period, laundry pieces/kg, or monthly review reminder.
4. Save once. A similar bill prompts a duplicate warning; a genuinely separate
   purchase requires an explicit confirmation.
5. Use **Record payment** on the existing bill for later instalments. **Reimburse
   staff** records property money paid to a staff member; it does not create a
   second expense. **Supplier refund** records money received, reducing operating
   cost on the refund date. Neither action transfers actual money.

Payment, refund and reimbursement history is retained, with amounts validated
under a bill lock. Payments cannot predate the bill or earlier ledger actions.
Paid entries retain their amount, bill date, payer and classification; correct
notes/measurements with a reason. Owners can remove an incorrect entry (including
its recorded money movements from reports); removal is not a real supplier refund.
Use history to see recording staff names/emails, actions and correction notes.

Monthly reminders require review and a new saved bill; there is no automatic
expense or payment. The next bill requires a fresh payment choice, with no copied receipt, kWh or
billing period. Each source can create only one active bill for a given bill date.

### Owner reports and downloads

**Reports → Income & Expenses** opens this month, with last month/today/custom
controls and up to 366 selected days. Reports are owner-only; staff can still
record and search property expenses. Revenue, operating cost/result and actual
cash movement remain separate. Equipment, refundable deposits and owner movements
are excluded from operating cost. Owner contributions increase property cash,
not revenue. This is recorded operational reporting, not complete accounting profit.

- Six-month revenue/cost bars; select a month to change the report period.
- Category spending bars link to filtered bills.
- Electricity/laundry cards compare matching elapsed month days (completed
  months compare complete months); custom ranges compare the preceding equal
  number of days. Missing bills are not presented as verified zero spending.
- Electricity comparisons show amount, recorded kWh and average kWh per billed
  day across bills. Missing measurements are flagged, rather than interpreted
  as consumption savings. Tariffs and fixed charges can affect cost independently.
- Laundry keeps pieces/kg and their measured bill rates separate. Occupied unit
  nights combine rooms and beds as context; no blended per-guest cost is claimed.
- Unpaid and reimbursement balances use payment history as of the selected end
  date. A September bill paid in October remains unpaid in September's report.
  Later bill corrections/removals are reflected in historical reports; these are
  not locked accounting-period snapshots.
- **Download report CSV** includes summary, comparisons and daily figures.
  **Print / Save PDF** opens the browser print dialog for the selected report.
  **Download expenses CSV** includes all matching pages, filters and as-of balances.
  CSV text is escaped and spreadsheet formulas in user-entered text are neutralized.

Receipts are private and loaded only on request via a short-lived signed URL.
Graphs use CSS, with no animation or chart dependency. Dashboard operating costs
also use ledger payments/refunds rather than the old full-paid flag. Financial
reports do not include taxes, depreciation or unrecorded costs automatically.

Cash drawer shift closing, budgets and configurable approval thresholds remain
separate future work; they are not inferred from expense payment methods.

Apply supabase/migrations/202610110012_operations_expenses.sql in Supabase SQL Editor after migration 011. Deploy the app afterward. This migration has not been applied automatically.

## Stock setup
Owners add items under Housekeeping (Bedsheets, Pillowcases, Towels, Detergent, etc.). Add different sizes/types separately. Linen uses whole pieces; supplies allow two decimals in the chosen unit.

Record opening stock once for each existing state: clean, in use, dirty, or at laundry. Clean is ready to issue. Then use Issue -> Collect dirty -> Send laundry -> Return clean. Transfers conserve total owned pieces; receiving increases stock, discarding reduces it. Supplies support receiving and consumption. The server locks each item and rejects negative stock or cross-property access. Movements are recorded manually, including laundry returns; checkout does not move stock automatically.

## Costs
Use Expenses to record laundry charges, linen/clothes purchases, cleaning, supplies, electricity, salary and other costs. Electricity kWh is optional. Stock movements never create costs automatically: enter each bill only once.

Record bill date and optional due date. Paid entries require the actual payment date and method. Unpaid bills can later be marked paid. Owners can void incorrect entries with a mandatory reason, then add replacements; void is a record correction, not a refund. Creation, payments and voids are audited. Migration 013 adds expense editing with a required correction reason, before/after audit history, and a collapsed Add expense card.

## Dashboard
Last-seven-day revenue remains the existing stay revenue. Expenses are attributed to bill dates. Revenue less expenses is a recorded operating result, not a complete accounting profit. Net operating cash = net guest receipts less expenses paid on payment dates. Unpaid costs are all outstanding expenses dated through today. Voided entries are excluded. Stock readiness and low stock are also shown.

Existing opening guest payment balances are excluded from cash movement totals. No payment, bank transfer or refund is processed here. Uploaded expense receipts, recurring schedules and automated housekeeping tasks are not included in this release.
