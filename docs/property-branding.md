# Admin-managed property identity

Apply `supabase/migrations/202610210023_property_branding.sql` after migration 022. It adds the property tagline, removes legacy contact defaults for future records, extends the existing admin save RPC, and exposes the selected property's public branding through `guest_property_profile`. The migration is safe to rerun.

In `/godfather`, choose **Add property** or **Property setup / logo** and configure:

- Property name and tagline/type, for example Backpackers Hostel or Homestay.
- Property logo, address, contact phone and timezone.
- Optional Instagram handle/profile URL, WhatsApp number with country code and Facebook page.
- Check-in and check-out times.

These details drive the dashboard greeting/day card, sidebar, navbar/property avatar, read-only property profile and guest web check-in. The dashboard shows configured Instagram/WhatsApp links. Guest check-in shows only configured social contacts. Missing logos use the property's initials; missing taglines and social details stay empty. The app name Stayman remains product branding, not a property profile.

There are no property-specific source-code or environment-variable fallbacks. Invalid or unresolved public property links cannot borrow another property's branding. Public profiles expose only name, tagline, logo and social contacts; billing/legal details and owner accounts remain private. Staff profiles reload when the browser tab regains focus.

Instagram handles such as `@garden_stays` are converted to an HTTPS profile URL. URL hosts and WhatsApp format are checked in both the presentation layer and the admin RPC. Owner/staff accounts cannot use the admin save operation. Existing core onboarding and owner-membership checks remain in effect.

Existing property records are not overwritten automatically. Review legacy contact values in the admin page and clear any links that do not belong to that property. New properties default to empty social fields. Issued invoice snapshots retain their original name/logo/legal details when the current property profile changes.

Validation: `node tests/property-branding-database.mjs`, `node --test tests/property-branding.test.mjs`, the full regression suite, and `npm run build`. Local database tests use synthetic data and do not apply migrations to live Supabase.
