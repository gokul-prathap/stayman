# Guest check-in social links

Run supabase/migrations/202610100011_property_social_links.sql in the Supabase SQL Editor after migration 010, then deploy the updated application.

Owners can edit Instagram, WhatsApp (including country code), and optional Facebook under Settings → Property. Leave a field empty to hide it. Initial values are Instagram https://www.instagram.com/hostarica_/ and WhatsApp +918593988018.

Guest check-in shows an Instagram icon in the header, a follow link in the footer, WhatsApp contact, and Facebook when configured. Property QR links and booking invitations resolve their own property settings. The public profile function exposes only the property name and social/contact links; staff records and identity documents remain private.

The migration has not been applied automatically to the hosted database.
