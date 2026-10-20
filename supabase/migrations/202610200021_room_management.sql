begin;
alter table public.stayman_units add column if not exists archived_at timestamptz;
create table if not exists public.stayman_inventory_events(
 id uuid primary key default gen_random_uuid(),property_id uuid not null references public.stayman_properties(id),
 unit_id uuid references public.stayman_units(id),actor uuid not null references auth.users(id),
 action text not null,before_details jsonb,after_details jsonb,created_at timestamptz not null default now()
);
alter table public.stayman_inventory_events enable row level security;
revoke all on public.stayman_inventory_events from public,anon,authenticated;
grant select on public.stayman_inventory_events to authenticated;
drop policy if exists owner_admin_inventory_events on public.stayman_inventory_events;
create policy owner_admin_inventory_events on public.stayman_inventory_events for select to authenticated
using(public.stayman_is_owner(property_id) or public.stayman_is_platform_admin());

create or replace function public.stayman_room_inventory(p_property uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare manage boolean:=public.stayman_is_owner(p_property) or public.stayman_is_platform_admin();
begin
 if not manage and not public.stayman_is_staff(p_property) then raise exception 'Property access required.';end if;
 return jsonb_build_object('can_manage',manage,'units',coalesce((select jsonb_agg(to_jsonb(u) order by u.archived_at nulls first,u.room_name,u.label) from public.stayman_units u where property_id=p_property),'[]'::jsonb));
end $$;

create or replace function public.stayman_save_unit(p_property uuid,p_id uuid,p_details jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare old public.stayman_units; saved public.stayman_units; room text:=trim(p_details->>'room_name'); unit_label text:=trim(p_details->>'label'); kind text:=p_details->>'unit_type'; gender text:=p_details->>'gender_policy'; today date;
begin
 if not (public.stayman_is_owner(p_property) or public.stayman_is_platform_admin()) then raise exception 'Owner or platform administrator access required.';end if;
 if p_id is null or p_details is null or jsonb_typeof(p_details)<>'object' or room is null or length(room) not between 1 and 100 or unit_label is null or length(unit_label) not between 1 and 100 or kind is null or kind not in ('BED','ROOM') or gender is null or gender not in ('ANY','FEMALE_ONLY','MALE_ONLY') then raise exception 'Check the room name, unit label, type and gender policy.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_property::text,21));
 select (now() at time zone timezone)::date into today from public.stayman_properties where id=p_property;
 if not found then raise exception 'Property not found.';end if;
 select * into old from public.stayman_units where id=p_id for update;
 if found and old.property_id<>p_property then raise exception 'Unit belongs to another property.';end if;
 if old.archived_at is not null then raise exception 'Archived units cannot be edited. Their history is retained.';end if;
 if exists(select 1 from public.stayman_units u where u.property_id=p_property and u.id<>p_id and lower(trim(u.room_name))=lower(room) and lower(trim(u.label))=lower(unit_label)) then raise exception 'This room already has a unit with that label.';end if;
 if old.id is not null and kind<>old.unit_type and exists(select 1 from public.stayman_allocations where unit_id=p_id) then raise exception 'A unit with allocation history cannot change accommodation type. Add a new unit instead.';end if;
 if old.id is not null and gender<>old.gender_policy and exists(select 1 from public.stayman_allocations where unit_id=p_id and check_out_date>today) then raise exception 'Move current and future allocations before changing the gender policy.';end if;
 if old.id is null then
  if coalesce(p_details->>'nightly_rate_paise','') !~ '^[0-9]{1,10}$' or (p_details->>'nightly_rate_paise')::bigint>100000000 then raise exception 'Enter a valid nightly rate.';end if;
  insert into public.stayman_units(id,property_id,room_name,label,unit_type,gender_policy,nightly_rate_paise)
  values(p_id,p_property,room,unit_label,kind,gender,(p_details->>'nightly_rate_paise')::bigint) returning * into saved;
 else
  -- Room edits never reprice either existing bookings or the standard rate.
  update public.stayman_units set room_name=room,label=unit_label,unit_type=kind,gender_policy=gender where id=p_id returning * into saved;
 end if;
 if to_jsonb(old) is distinct from to_jsonb(saved) then
  insert into public.stayman_inventory_events(property_id,unit_id,actor,action,before_details,after_details) values(p_property,p_id,auth.uid(),case when old.id is null then 'CREATED' else 'UPDATED' end,case when old.id is null then null else to_jsonb(old) end,to_jsonb(saved));
 end if;
 return p_id;
end $$;

create or replace function public.stayman_rename_room(p_property uuid,p_old_name text,p_new_name text) returns void
language plpgsql security definer set search_path='' as $$
declare u public.stayman_units; name text:=trim(p_new_name);
begin
 if not (public.stayman_is_owner(p_property) or public.stayman_is_platform_admin()) then raise exception 'Owner or platform administrator access required.';end if;
 if name is null or length(name) not between 1 and 100 then raise exception 'Enter a room name of up to 100 characters.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_property::text,21));
 if not exists(select 1 from public.stayman_units where property_id=p_property and room_name=p_old_name and archived_at is null) then raise exception 'Active room not found.';end if;
 if exists(select 1 from public.stayman_units where property_id=p_property and lower(trim(room_name))=lower(name) and room_name<>p_old_name) then raise exception 'A room with this name already exists. Choose a different name.';end if;
 if p_old_name=name then return;end if;
 for u in select * from public.stayman_units where property_id=p_property and room_name=p_old_name and archived_at is null for update loop
  update public.stayman_units set room_name=name where id=u.id;
  insert into public.stayman_inventory_events(property_id,unit_id,actor,action,before_details,after_details) values(p_property,u.id,auth.uid(),'ROOM_RENAMED',to_jsonb(u),to_jsonb(u)||jsonb_build_object('room_name',name));
 end loop;
end $$;

create or replace function public.stayman_archive_unit(p_property uuid,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u public.stayman_units; today date;
begin
 if not (public.stayman_is_owner(p_property) or public.stayman_is_platform_admin()) then raise exception 'Owner or platform administrator access required.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_property::text,21));
 select * into u from public.stayman_units where id=p_id and property_id=p_property for update;
 if not found then raise exception 'Unit not found.';end if;
 if u.archived_at is not null then return;end if;
 select (now() at time zone timezone)::date into today from public.stayman_properties where id=p_property;
 if exists(select 1 from public.stayman_allocations where unit_id=p_id and check_out_date>today) then raise exception 'Cannot archive a unit with current or future bookings or maintenance. Move or release those allocations first.';end if;
 update public.stayman_units set archived_at=now() where id=p_id;
 insert into public.stayman_inventory_events(property_id,unit_id,actor,action,before_details,after_details) values(p_property,p_id,auth.uid(),'ARCHIVED',to_jsonb(u),to_jsonb(u)||jsonb_build_object('archived_at',now()));
end $$;

-- Enforced for all reservation creation, transfer, extension and maintenance RPCs.
create or replace function public.stayman_active_unit_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare u public.stayman_units;
begin
 if tg_op='UPDATE' and new.unit_id=old.unit_id then return new;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.property_id::text,21));
 select * into u from public.stayman_units where id=new.unit_id and property_id=new.property_id for share;
 if not found or u.archived_at is not null then raise exception 'This room or bed is archived and cannot accept allocations.';end if;
 return new;
end $$;
drop trigger if exists stayman_active_unit_guard on public.stayman_allocations;
create trigger stayman_active_unit_guard before insert or update of unit_id on public.stayman_allocations for each row execute function public.stayman_active_unit_guard();
revoke all on function public.stayman_active_unit_guard() from public,anon,authenticated;
revoke all on function public.stayman_room_inventory(uuid),public.stayman_save_unit(uuid,uuid,jsonb),public.stayman_rename_room(uuid,text,text),public.stayman_archive_unit(uuid,uuid) from public,anon;
grant execute on function public.stayman_room_inventory(uuid),public.stayman_save_unit(uuid,uuid,jsonb),public.stayman_rename_room(uuid,text,text),public.stayman_archive_unit(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
