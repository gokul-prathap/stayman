# Linen, supplies and operating expenses

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
