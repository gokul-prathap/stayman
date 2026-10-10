# Reservation database setup

The allocation matrix, Reservations and Guest list now use Supabase. The public guest QR page remains separate and does not require staff login.

## 1. Run the migration in Supabase

Open SQL Editor, paste the entire file `supabase/migrations/202610100006_stayman_reservations.sql` and Run once. It creates separate `stayman_*` tables and does not change your guest-check-in migrations or any existing legacy reservation tables.

## 2. Add optional sample data

Run `supabase/seed/stayman_demo.sql` in SQL Editor. It adds Hostarica, four dorm beds, a private room, two sample reservations and a maintenance block with dates relative to today. These are dummy guests. Use only in a test property; remove them before collecting real records.

For production, create the property and units in Table Editor as an administrator instead. The sample property UUID below must then be replaced with your own property ID.

## 3. Create a manager login

In Supabase Authentication → Users, add a user with your email and a strong password, confirmed. This is a staff account; do not use an anonymous guest account.

Then run this SQL after replacing the email:

```sql
insert into public.stayman_staff(property_id,user_id)
select '10000000-0000-0000-0000-000000000001'::uuid,id
from auth.users where lower(email)=lower('YOUR_MANAGER_EMAIL')
on conflict do nothing;

select s.property_id,u.email from public.stayman_staff s
join auth.users u on u.id=s.user_id;
```

Check that the result contains your email. Zero rows means the user/email or property setup is missing.

## 4. Run and test

Keep the existing Supabase browser URL and publishable key in .env.local (and Vercel environment settings). No service-role key or database password belongs in the frontend.

Run `npm run dev`, open `/allocation`, and sign in with the manager account. Open `/guests` to see guest records and create a new reservation; `/reservations` shows dates, payments and all bed segments. A new booking appears on all three pages and persists after refresh.

Drag one occupied night onto an available compatible bed and confirm. Refresh: only that night should move. Try an overlapping reservation: the database must reject it. Mark an empty day as maintenance: it should remain dashed after refresh. Sign out and verify reservation records are inaccessible without staff membership.

The reservation and guest rows are created together in one transaction. Bed overlap is prevented by a PostgreSQL exclusion constraint, including concurrent requests. Staff membership is property-scoped; anonymous QR sessions cannot read these tables or execute management functions.

QR uploads remain in guest_checkin_invitations and guest-identities storage. They are not automatically matched to reservations or exposed in the staff guest list. Rooms, dashboard and housekeeping pages have not been connected by this change.

No SQL has been applied to your live Supabase project by this local change.
