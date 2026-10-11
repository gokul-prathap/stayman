-- Apply after migration 011. Stock ledger and operating expenses; amounts are paise.
begin;
create table public.stayman_stock_items (
 id uuid primary key default gen_random_uuid(),
 property_id uuid not null references public.stayman_properties(id),
 name text not null check(length(trim(name)) between 2 and 100),
 kind text not null check(kind in ('LINEN','SUPPLY')),
 unit text not null default 'pieces' check(length(trim(unit)) between 1 and 20),
 low_stock numeric(12,2) not null default 0 check(low_stock>=0),
 clean numeric(12,2) not null default 0 check(clean>=0),
 in_use numeric(12,2) not null default 0 check(in_use>=0),
 dirty numeric(12,2) not null default 0 check(dirty>=0),
 laundry numeric(12,2) not null default 0 check(laundry>=0),
 created_at timestamptz not null default now(),
 unique(id,property_id),unique(property_id,name),
 check(kind<>'LINEN' or (clean=trunc(clean) and in_use=trunc(in_use) and dirty=trunc(dirty) and laundry=trunc(laundry))),
 check(kind<>'SUPPLY' or (in_use=0 and dirty=0 and laundry=0))
);
create table public.stayman_stock_movements (
 id uuid primary key default gen_random_uuid(),
 property_id uuid not null references public.stayman_properties(id),
 item_id uuid not null,
 action text not null check(action in ('RECEIVE','RECEIVE_DIRTY','RECEIVE_IN_USE','RECEIVE_LAUNDRY','ISSUE','DIRTY','SEND_LAUNDRY','RETURN','DISCARD_CLEAN','DISCARD_DIRTY','CONSUME')),
 quantity numeric(12,2) not null check(quantity>0),
 note text not null default '' check(length(note)<=250),
 recorded_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 request_id uuid not null unique,
 foreign key(item_id,property_id) references public.stayman_stock_items(id,property_id)
);
create table public.stayman_expenses (
 id uuid primary key default gen_random_uuid(),
 property_id uuid not null references public.stayman_properties(id),
 category text not null check(category in ('ELECTRICITY','WATER','CLEANING','LAUNDRY','LINEN','SUPPLIES','SALARY','RENT','INTERNET','WASTE','REPAIRS','OTHER')),
 description text not null check(length(trim(description)) between 2 and 250),
 vendor text not null default '' check(length(vendor)<=100),
 amount_paise bigint not null check(amount_paise between 1 and 10000000000),
 expense_date date not null,
 due_date date,
 units_consumed numeric(12,2) check(units_consumed>=0),
 paid_date date,
 method text check(method in ('CASH','UPI','CARD','BANK')),
 recorded_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 request_id uuid not null unique,
 voided_at timestamptz, voided_by uuid references auth.users(id),void_reason text,
 check((paid_date is null and method is null) or (paid_date is not null and method is not null)),
 check(category='ELECTRICITY' or units_consumed is null)
);
create table public.stayman_expense_events (
 id uuid primary key default gen_random_uuid(),
 property_id uuid not null references public.stayman_properties(id),
 expense_id uuid not null references public.stayman_expenses(id),
 action text not null, actor uuid not null references auth.users(id),
 created_at timestamptz not null default now(), note text not null default ''
);
do $$ declare t text; begin
 foreach t in array array['stayman_stock_items','stayman_stock_movements','stayman_expenses','stayman_expense_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy staff_read on public.%I for select to authenticated using(public.stayman_is_staff(property_id))',t);
 end loop;
end $$;
create index on public.stayman_expenses(property_id,expense_date);
create index on public.stayman_stock_movements(property_id,created_at);
create index on public.stayman_expense_events(property_id,created_at);

create function public.stayman_create_stock(p_property uuid,p_name text,p_kind text,p_unit text,p_low numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not public.stayman_is_owner(p_property) then raise exception 'Owner access required to add stock items.'; end if;
 if p_name is null or p_kind is null or p_unit is null or p_low is null then raise exception 'Complete the item details.'; end if;
 if p_low<0 or p_low>1000000 or (p_kind='LINEN' and p_low<>trunc(p_low)) then raise exception 'Invalid stock threshold.'; end if;
 insert into public.stayman_stock_items(property_id,name,kind,unit,low_stock)
 values(p_property,trim(p_name),p_kind,trim(p_unit),p_low) returning id into result;
 return result;
end $$;
create function public.stayman_move_stock(p_item uuid,p_action text,p_quantity numeric,p_note text,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare item public.stayman_stock_items; result uuid; src text; dest text; available numeric;
begin
 select * into item from public.stayman_stock_items where id=p_item for update;
 if not found or not public.stayman_is_staff(item.property_id) then raise exception 'Staff access required.'; end if;
 select id into result from public.stayman_stock_movements where request_id=p_request and property_id=item.property_id;
 if found then return result; end if;
 if p_request is null or p_action is null or p_quantity is null or p_quantity<=0 or p_quantity>1000000 or p_quantity<>round(p_quantity,2)
 or length(coalesce(p_note,''))>250 or (item.kind='LINEN' and p_quantity<>trunc(p_quantity)) then raise exception 'Enter a valid stock quantity.'; end if;
 if item.kind='SUPPLY' and p_action not in ('RECEIVE','CONSUME') then raise exception 'Supplies support receiving and consumption only.'; end if;
 if item.kind='LINEN' and p_action='CONSUME' then raise exception 'Use a linen movement.'; end if;
 case p_action
 when 'RECEIVE' then dest:='clean';
 when 'RECEIVE_DIRTY' then dest:='dirty';
 when 'RECEIVE_IN_USE' then dest:='in_use';
 when 'RECEIVE_LAUNDRY' then dest:='laundry';
 when 'ISSUE' then src:='clean'; dest:='in_use';
 when 'DIRTY' then src:='in_use'; dest:='dirty';
 when 'SEND_LAUNDRY' then src:='dirty'; dest:='laundry';
 when 'RETURN' then src:='laundry'; dest:='clean';
 when 'DISCARD_CLEAN' then src:='clean';
 when 'DISCARD_DIRTY' then src:='dirty';
 when 'CONSUME' then src:='clean';
 else raise exception 'Invalid stock movement.';
 end case;
 if src is not null then
 execute format('select %I from public.stayman_stock_items where id=$1',src) into available using item.id;
 if available<p_quantity then raise exception 'Not enough stock in the selected state. Refresh and try again.'; end if;
 execute format('update public.stayman_stock_items set %I=%I-$1 where id=$2',src,src) using p_quantity,item.id;
 end if;
 if dest is not null then
 execute format('update public.stayman_stock_items set %I=%I+$1 where id=$2',dest,dest) using p_quantity,item.id;
 end if;
 insert into public.stayman_stock_movements(property_id,item_id,action,quantity,note,recorded_by,request_id)
 values(item.property_id,item.id,p_action,p_quantity,coalesce(p_note,''),auth.uid(),p_request) returning id into result;
 return result;
end $$;
create function public.stayman_add_expense(p_property uuid,p_details jsonb,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; paid date;
begin
 if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.'; end if;
 select id into result from public.stayman_expenses where request_id=p_request and property_id=p_property;
 if found then return result; end if;
 if p_request is null or p_details is null or jsonb_typeof(p_details)<>'object' then raise exception 'Complete expense details.'; end if;
 paid:=nullif(p_details->>'paid_date','')::date;
 if (p_details->>'expense_date')::date>(now() at time zone (select timezone from public.stayman_properties where id=p_property))::date
 or paid>(now() at time zone (select timezone from public.stayman_properties where id=p_property))::date then raise exception 'Expense and payment dates cannot be in the future.'; end if;
 insert into public.stayman_expenses(property_id,category,description,vendor,amount_paise,expense_date,due_date,units_consumed,paid_date,method,recorded_by,request_id)
 values(p_property,p_details->>'category',trim(p_details->>'description'),coalesce(trim(p_details->>'vendor'),''),
 (p_details->>'amount_paise')::bigint,(p_details->>'expense_date')::date,nullif(p_details->>'due_date','')::date,
 nullif(p_details->>'units_consumed','')::numeric,paid,case when paid is not null then p_details->>'method' end,auth.uid(),p_request)
 returning id into result;
 insert into public.stayman_expense_events(property_id,expense_id,action,actor) values(p_property,result,'CREATED',auth.uid());
 return result;
end $$;
create function public.stayman_pay_expense(p_expense uuid,p_day date,p_method text)
returns void language plpgsql security definer set search_path='' as $$
declare e public.stayman_expenses;
begin
 select * into e from public.stayman_expenses where id=p_expense for update;
 if not found or not public.stayman_is_staff(e.property_id) then raise exception 'Staff access required.'; end if;
 if e.voided_at is not null then raise exception 'Expense is voided.'; end if;
 if e.paid_date is not null then raise exception 'Expense already paid. Refresh the page.'; end if;
 if p_day is null or p_method is null or p_day>(now() at time zone (select timezone from public.stayman_properties where id=e.property_id))::date then raise exception 'Enter a valid payment date.'; end if;
 update public.stayman_expenses set paid_date=p_day,method=p_method where id=e.id;
 insert into public.stayman_expense_events(property_id,expense_id,action,actor,note) values(e.property_id,e.id,'PAID',auth.uid(),p_day::text||' '||p_method);
end $$;
create function public.stayman_void_expense(p_expense uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare e public.stayman_expenses;
begin
 select * into e from public.stayman_expenses where id=p_expense for update;
 if not found or not public.stayman_is_owner(e.property_id) then raise exception 'Owner access required.'; end if;
 if e.voided_at is not null then return; end if;
 if p_reason is null or length(trim(p_reason)) not between 2 and 250 then raise exception 'A correction reason is required.'; end if;
 update public.stayman_expenses set voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason) where id=e.id;
 insert into public.stayman_expense_events(property_id,expense_id,action,actor,note) values(e.property_id,e.id,'VOIDED',auth.uid(),trim(p_reason));
end $$;
revoke all on function public.stayman_create_stock(uuid,text,text,text,numeric), public.stayman_move_stock(uuid,text,numeric,text,uuid),
 public.stayman_add_expense(uuid,jsonb,uuid),public.stayman_pay_expense(uuid,date,text),public.stayman_void_expense(uuid,text) from public,anon;
grant execute on function public.stayman_create_stock(uuid,text,text,text,numeric),public.stayman_move_stock(uuid,text,numeric,text,uuid),
 public.stayman_add_expense(uuid,jsonb,uuid),public.stayman_pay_expense(uuid,date,text),public.stayman_void_expense(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
