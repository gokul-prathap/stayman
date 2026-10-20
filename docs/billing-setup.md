# Billing and quick expenses

Apply `supabase/migrations/202610190018_billing_drafts.sql` after migration 017 before using the billing screens. This migration adds protected billing tables and RPCs; it does not configure a property's tax registration automatically.

## Configure a property

Open `/godfather` with an email-OTP platform administrator account. Use **Add property** to open `/godfather/properties/new`, or **Property setup / logo** on an existing property. Save the property identity, owner access and logo first, then complete the invoice and tax details on the same page. Confirm its legal name, billing address, tax registration, price mode, invoice prefix, and the applicable rates and SAC codes for accommodation and extra charges. The existing property onboarding/profile supplies the logo and contact details.

Registration starts as **Unconfigured**. Staff may prepare a draft, but an administrator cannot issue it until registration is confirmed. Non-registered properties have no GST added. Registered properties require an accommodation SAC and a SAC for each charge actually used. Rates are entered by the administrator; no tax rate is assumed. Confirm the applicable configuration with the property's accountant.

Only platform administrators can change property and billing settings. The staff profile icon opens a read-only property profile. The database enforces these restrictions independently of the UI.

## Prepare and issue a bill

In a reservation, expand **Prepare / view invoice**. Staff can add early check-in, towel, soap, toothbrush, locker, lock penalty, damage penalty, or other charges, with a quantity and unit price. Penalties require a reason. Incorrect draft charges can be voided with a reason; their audit history remains.

Enter the billing recipient and submit the draft. Submission locks staff edits. The platform administrator reviews it in the billing queue and either returns it with a correction reason or approves and issues it. Booking changes after submission require a freshly prepared draft. Invoice numbers are allocated only on issuance.

The folio covers the booking/group. It includes accommodation, extra charges, and multiple payments. Issued charge amounts, tax calculations, property details, and recipient details are frozen. Changing property settings later does not rewrite old invoices. Payment history and the outstanding balance remain current.

Use **Print / save PDF** to print or save through the browser's print dialog. Drafts are clearly marked. This is a printable invoice page, not a server-generated PDF attachment.

Staff can also use **Print invoice** at the end of a booked guest's register row. It opens the booking invoice in a new tab and requests the print dialog after fonts and images load. Guests without a booking must be allocated first. Unissued documents print as drafts; printing does not issue an invoice.

## Temporary development administrator login

Apply migration `202610190019_dev_admin_password.sql` after migration 018. It permits password authentication for the existing platform administrator `gokulprathap@rocketmail.com` for seven days from migration application. The account must already exist. The migration assigns platform-admin membership to this exact confirmed email; it creates neither an account nor a password.

Run `npm run dev` and visit `/godfather` to use the development password form. Set the account password in Supabase Authentication if it currently has only OTP access. Do not put passwords or service-role keys in browser environment variables. Production builds continue to show the OTP form.

The server exception is tied to the Supabase database, not the browser's localhost origin. Use a development Supabase project where possible. To revoke it immediately, run `delete from public.stayman_dev_admin_password_access;` in the Supabase SQL editor. Removing the exception does not revoke OTP login. An expired or missing exception rejects password-based admin operations even if a browser session still exists.

## Calculations and payments

Money is stored and calculated in integer paise. Exclusive prices add separately rounded tax components. Inclusive prices extract the taxable amount and show any one-paisa reconciliation explicitly. Charges use the property's configured rates and price mode.

The existing accommodation payment action remains available. After issuance, staff can also record a receipt against the whole folio. Full-folio receipts first settle outstanding accommodation and then extra charges, without counting the same payment twice. Receipts record money already collected; they do not process a bank/card transaction. Duplicate retries are protected, and overpayment is rejected.

## Quick expenses

The top-bar **Expense** button opens a short form for description, amount, category, date, optional vendor, and whether payment has already been made. It uses the existing expense ledger. Guest charges and property expenses are separate records: adding a towel charge does not automatically purchase stock or create an expense.

## Current boundaries and validation

Issued invoices cannot be deleted, repriced, cancelled, or have their booking dates silently changed. Credit notes, issued-invoice corrections, and refunds of ancillary-charge receipts need a dedicated future workflow. Existing revenue reports continue to describe accommodation revenue; use the folio for the complete booking amount including extras.

Local verification: `node tests/billing-database.mjs` applies the migration in an isolated PostgreSQL-compatible PGlite database and checks authorization, RLS, immutable issuance, stale approvals, retries, payment reconciliation, and rounding. Run the existing `tests/*.test.mjs` suite and `npm run build` as well. This does not replace applying and verifying the migration in the project's Supabase environment.
