-- Optional sample data; run AFTER migration 006. Dates follow the current Indian calendar day.
begin;
insert into public.stayman_properties(id,name) values('10000000-0000-0000-0000-000000000001','Hostarica') on conflict(id) do nothing;
insert into public.stayman_units(id,property_id,room_name,label,unit_type) values
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Mixed Dorm','Bed A','BED'),
('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Mixed Dorm','Bed B','BED'),
('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Mixed Dorm','Bed C','BED'),
('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','Mixed Dorm','Bed D','BED'),
('20000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','Private Room','Room 101','ROOM') on conflict(id) do nothing;
insert into public.stayman_guests(id,property_id,full_name,phone,email,gender) values
('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Sample Guest A','+919000000001','guest.a@example.com','MALE'),
('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Sample Guest B','+919000000002','guest.b@example.com','FEMALE') on conflict(id) do nothing;
insert into public.stayman_reservations(id,property_id,guest_id,booking_ref,check_in_date,check_out_date,status,total_amount,paid_amount)
values
('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','DEMO-A',(now() at time zone 'Asia/Kolkata')::date,(now() at time zone 'Asia/Kolkata')::date+3,'CHECKED_IN',150000,100000),
('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','DEMO-B',(now() at time zone 'Asia/Kolkata')::date+1,(now() at time zone 'Asia/Kolkata')::date+4,'PENDING',150000,50000) on conflict(id) do nothing;
insert into public.stayman_allocations(id,property_id,reservation_id,unit_id,check_in_date,check_out_date,status)
select case when booking_ref='DEMO-A' then '50000000-0000-0000-0000-000000000001'::uuid else '50000000-0000-0000-0000-000000000002'::uuid end,
property_id,id,case when booking_ref='DEMO-A' then '20000000-0000-0000-0000-000000000001'::uuid else '20000000-0000-0000-0000-000000000002'::uuid end,check_in_date,check_out_date,status
from public.stayman_reservations r where booking_ref in ('DEMO-A','DEMO-B')
and not exists(select 1 from public.stayman_allocations a where a.reservation_id=r.id);
insert into public.stayman_allocations(id,property_id,unit_id,check_in_date,check_out_date,status,reason)
values('50000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004',(now() at time zone 'Asia/Kolkata')::date,(now() at time zone 'Asia/Kolkata')::date+1,'MAINTENANCE','Sample: painting') on conflict(id) do nothing;
commit;
