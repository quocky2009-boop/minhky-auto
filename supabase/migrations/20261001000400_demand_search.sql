-- =====================================================================
-- MINH KỲ AUTO — 0400 View tìm kiếm/lọc nhu cầu (security_invoker: tuân RLS của người gọi)
-- Gộp tiêu chí mua và xe khách chào bán về cùng các cột để lọc kết hợp.
--   price_low/price_high : khoảng ngân sách (mua) hoặc giá khách muốn (bán). Thiếu một đầu = khoảng mở.
--   has_price            : false khi chưa biết giá/ngân sách nào -> không tự coi là phù hợp khi lọc giá.
-- =====================================================================
create or replace view public.demand_search with (security_invoker = true) as
select
  d.id, d.code, d.kind, d.status, d.priority, d.owner_id, d.source_id, d.customer_id,
  d.next_action, d.next_action_due, d.last_contact_at, d.last_activity_at, d.created_at, d.updated_at,
  d.wants_trade_in, d.needs_loan, d.version,
  c.full_name as customer_name, c.phone as customer_phone, c.area as customer_area,
  p.full_name as owner_name,
  case when d.kind = 'buy' then d.budget_min else s.asking_price end as price_low,
  case when d.kind = 'buy' then d.budget_max else s.asking_price end as price_high,
  case when d.kind = 'buy' then (d.budget_min is not null or d.budget_max is not null) else s.asking_price is not null end as has_price,
  case when d.kind = 'buy' then d.year_min else s.year_made end as year_low,
  case when d.kind = 'buy' then d.year_max else s.year_made end as year_high,
  case when d.kind = 'buy' then d.colors_accepted else array_remove(array[s.color], null) end as colors,
  (coalesce(d.wants_trade_in, false) or coalesce(s.sale_mode = 'trade_in', false)) as is_trade_in,
  s.sale_mode,
  coalesce(case when d.kind = 'buy' then (select array_agg(distinct o.make_id) from public.demand_vehicle_options o where o.demand_id = d.id)
                else array_remove(array[s.make_id], null) end, '{}') as make_ids,
  coalesce(case when d.kind = 'buy' then (select array_agg(distinct o.model_id) filter (where o.model_id is not null) from public.demand_vehicle_options o where o.demand_id = d.id)
                else array_remove(array[s.model_id], null) end, '{}') as model_ids,
  coalesce(case when d.kind = 'buy' then (select array_agg(distinct o.variant_id) filter (where o.variant_id is not null) from public.demand_vehicle_options o where o.demand_id = d.id)
                else array_remove(array[s.variant_id], null) end, '{}') as variant_ids,
  case when d.kind = 'buy' then (
      select string_agg(concat_ws(' ', mk.name, md.name, vr.name), ' / ' order by mk.name, md.name)
      from public.demand_vehicle_options o
      join public.vehicle_makes mk on mk.id = o.make_id
      left join public.vehicle_models md on md.id = o.model_id
      left join public.vehicle_variants vr on vr.id = o.variant_id
      where o.demand_id = d.id)
    else (select concat_ws(' ', mk.name, md.name, vr.name, s.year_made::text)
          from public.vehicle_makes mk
          left join public.vehicle_models md on md.id = s.model_id
          left join public.vehicle_variants vr on vr.id = s.variant_id
          where mk.id = s.make_id)
  end as vehicle_summary,
  private.norm_text(concat_ws(' ', d.code, c.full_name, c.phone, c.phone_normalized, c.area, d.notes, d.raw_message, d.next_action,
    (select string_agg(concat_ws(' ', mk.name, md.name, vr.name), ' ')
       from public.vehicle_makes mk
       left join public.vehicle_models md on md.make_id = mk.id and md.id = any (array[s.model_id] || (select array_agg(o.model_id) from public.demand_vehicle_options o where o.demand_id = d.id))
       left join public.vehicle_variants vr on vr.model_id = md.id and vr.id = any (array[s.variant_id] || (select array_agg(o.variant_id) from public.demand_vehicle_options o where o.demand_id = d.id))
       where mk.id = any (array[s.make_id] || (select array_agg(o.make_id) from public.demand_vehicle_options o where o.demand_id = d.id))))) as search_text
from public.demands d
join public.customers c on c.id = d.customer_id
left join public.sell_offers s on s.demand_id = d.id
left join public.profiles p on p.id = d.owner_id;

revoke all on public.demand_search from anon;
grant select on public.demand_search to authenticated;

-- ---------------------------------------------------------------------
-- RPC lọc nhu cầu dùng chung cho giao diện và test. security invoker -> tuân RLS.
-- f: { kind, state, make_id, model_id, variant_id, year_from, year_to, color, price_from, price_to,
--      area, owner_id, source_id, priority, followup, updated_since, q, sort }
-- Khoảng giá/năm: lấy giao của hai khoảng; đầu thiếu = mở. Nhu cầu chưa có giá/năm nào bị loại khi lọc theo giá/năm.
-- ---------------------------------------------------------------------
create or replace function public.search_demands(f jsonb default '{}'::jsonb, p_limit integer default 25, p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with params as (
    select
      nullif(f ->> 'kind', '') as kind,
      coalesce(nullif(f ->> 'state', ''), 'open') as state,
      private.try_uuid(f ->> 'make_id') as make_id,
      private.try_uuid(f ->> 'model_id') as model_id,
      private.try_uuid(f ->> 'variant_id') as variant_id,
      nullif(f ->> 'year_from', '')::int as year_from,
      nullif(f ->> 'year_to', '')::int as year_to,
      private.norm_text(f ->> 'color') as color,
      nullif(f ->> 'price_from', '')::numeric as price_from,
      nullif(f ->> 'price_to', '')::numeric as price_to,
      private.norm_text(f ->> 'area') as area,
      private.try_uuid(f ->> 'owner_id') as owner_id,
      private.try_uuid(f ->> 'source_id') as source_id,
      nullif(f ->> 'priority', '') as priority,
      nullif(f ->> 'followup', '') as followup,
      nullif(f ->> 'updated_since', '')::date as updated_since,
      private.norm_text(f ->> 'q') as q,
      coalesce(nullif(f ->> 'sort', ''), 'due') as sort,
      ((now() at time zone 'Asia/Ho_Chi_Minh')::date)::timestamp at time zone 'Asia/Ho_Chi_Minh' as today_start,
      coalesce((select (s.value #>> '{}')::int from public.app_settings s where s.key = 'demand_stale_after_days'), 14) as stale_days
  ),
  filtered as (
    select v.*,
      (v.status not in ('closed', 'won', 'acquired', 'paused') and v.last_activity_at < now() - make_interval(days => p.stale_days)) as is_stale
    from public.demand_search v, params p
    where (p.kind is null
           or (p.kind in ('buy', 'sell') and v.kind = p.kind)
           or (p.kind = 'trade_in' and v.is_trade_in))
      and (p.state = 'all'
           or (p.state = 'open' and v.status not in ('closed', 'won', 'acquired'))
           or (p.state = 'done' and v.status in ('won', 'acquired'))
           or (p.state = 'closed' and v.status = 'closed')
           or (p.state not in ('all', 'open', 'done', 'closed') and v.status = p.state))
      and (p.make_id is null or p.make_id = any (v.make_ids))
      and (p.model_id is null or p.model_id = any (v.model_ids))
      and (p.variant_id is null or p.variant_id = any (v.variant_ids))
      and ((p.year_from is null and p.year_to is null)
           or ((v.year_low is not null or v.year_high is not null)
               and (p.year_from is null or coalesce(v.year_high, v.year_low) >= p.year_from)
               and (p.year_to is null or coalesce(v.year_low, v.year_high) <= p.year_to)))
      and (p.color is null or exists (select 1 from unnest(v.colors) c where private.norm_text(c) = p.color))
      and ((p.price_from is null and p.price_to is null)
           or (v.has_price
               and (p.price_from is null or v.price_high is null or v.price_high >= p.price_from)
               and (p.price_to is null or v.price_low is null or v.price_low <= p.price_to)))
      and (p.area is null or private.norm_text(v.customer_area) like '%' || p.area || '%')
      and (p.owner_id is null or v.owner_id = p.owner_id)
      and (p.source_id is null or v.source_id = p.source_id)
      and (p.priority is null or v.priority = p.priority)
      and (p.updated_since is null or v.last_activity_at >= p.updated_since::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and (p.q is null or v.search_text like '%' || p.q || '%')
      and (p.followup is null
           or (p.followup = 'overdue' and v.status not in ('closed', 'won', 'acquired', 'paused') and v.next_action_due < p.today_start)
           or (p.followup = 'today' and v.status not in ('closed', 'won', 'acquired', 'paused')
               and v.next_action_due >= p.today_start and v.next_action_due < p.today_start + interval '1 day')
           or (p.followup = 'stale' and v.status not in ('closed', 'won', 'acquired', 'paused')
               and v.last_activity_at < now() - make_interval(days => p.stale_days))
           or (p.followup = 'no_next' and v.status not in ('closed', 'won', 'acquired', 'paused') and v.next_action_due is null))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(x) - 'search_text' order by x.rn)
      from (
        select fl.*, row_number() over (order by
            case when (select sort from params) = 'due' then fl.next_action_due end asc nulls last,
            case when (select sort from params) = 'created' then fl.created_at end desc,
            fl.last_activity_at desc, fl.id) as rn
        from filtered fl
        order by rn
        limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
      ) x), '[]'::jsonb));
$$;
revoke execute on function public.search_demands(jsonb, integer, integer) from public, anon;
grant execute on function public.search_demands(jsonb, integer, integer) to authenticated;
