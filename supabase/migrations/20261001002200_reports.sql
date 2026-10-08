-- =====================================================================
-- MINH KỲ AUTO — 2200 Chặng 6 (lát 8): dashboard lãnh đạo và báo cáo kết quả xe
--
-- CLAUDE.md §9: tồn sở hữu / ký gửi RIÊNG, tuổi tồn, vốn theo nguồn, công nợ, kết quả từng xe, phần công ty hưởng; báo cáo phân biệt
-- lãi gộp → kết quả sau chi phí trực tiếp → lợi nhuận phân chia → kết quả toàn showroom; không cộng khoản chia nội bộ thành doanh thu mới;
-- mọi số truy ngược được về giao dịch; dữ liệu thiếu KHÔNG coi là 0 (đếm riêng, không cộng vào tổng).
--  * Chỉ đọc (views + RPC security invoker). Chỉ quản lý/kế toán/admin có dữ liệu (private.can_see_finance); sales/kỹ thuật nhận rỗng.
--  * Tồn kho = xe đã nhập kho (intake_date) và chưa bán xong/chưa trả chủ. Xe chưa nhập kho (nguồn xe) đếm riêng, KHÔNG là tồn.
--  * Xe ký gửi không tăng giá trị vốn hàng tồn sở hữu của công ty.
--  * Kết quả xe tính theo ngày ký hợp đồng của đơn bán (giờ Asia/Ho_Chi_Minh). Lãi gộp = giá bán − giá mua (xe sở hữu, có giá mua).
--    Sau chi phí trực tiếp = lãi gộp − chi phí đã xác nhận do showroom chịu. Lợi nhuận phân chia (P) và phần công ty (C) lấy từ quyết toán ĐÃ DUYỆT.
--    Xe ký gửi: showroom hưởng phí ký gửi theo quyết toán đã duyệt (giá bán là tiền thu hộ, không phải doanh thu showroom).
--    Toàn showroom (tạm tính theo sổ quỹ, không thay kế toán): sau chi phí trực tiếp + phí ký gửi đã quyết toán − chi phí chung/chi khác + thu khác.
--    Hoa hồng và lãi vay KHÔNG tính (D39, D41, chưa có chính sách hoa hồng).
-- =====================================================================

-- Tồn kho theo xe (một dòng mỗi xe đã nhập kho, chưa bán xong).
create view public.report_inventory with (security_invoker = true) as
select v.id as vehicle_id, v.code, v.business_type, v.sale_status,
       concat_ws(' ', mk.name, md.name, vr.name, v.year_made::text) as label,
       ((now() at time zone 'Asia/Ho_Chi_Minh')::date - v.intake_date) as age_days,
       f.purchase_price,
       coalesce(cs.confirmed_showroom, 0) as costs_confirmed_showroom,
       coalesce(cs.open_lines, 0) as open_cost_lines,
       case when v.business_type = 'owned' and f.purchase_price is not null then f.purchase_price + coalesce(cs.confirmed_showroom, 0) end as capital_tied,
       coalesce((select sum(s.net_received) from public.vehicle_capital_summary s join public.capital_parties p on p.id = s.party_id
                 where s.vehicle_id = v.id and p.kind <> 'company'), 0) as external_capital,
       coalesce((select sum(ls.principal_outstanding) from public.vehicle_loan_summary ls where ls.vehicle_id = v.id and ls.status = 'active'), 0) as loan_outstanding
from public.vehicles v
join public.vehicle_makes mk on mk.id = v.make_id
left join public.vehicle_models md on md.id = v.model_id
left join public.vehicle_variants vr on vr.id = v.variant_id
left join public.vehicle_financials f on f.vehicle_id = v.id
left join public.vehicle_cost_summary cs on cs.vehicle_id = v.id
where v.archived_at is null and v.intake_date is not null and v.sale_status not in ('sold', 'delivered', 'returned_to_owner')
  and private.can_see_finance();

-- Kết quả từng xe đã bán (một dòng mỗi dòng đơn bán hiệu lực của đơn đã ký).
create view public.report_vehicle_results with (security_invoker = true) as
select l.id as line_id, o.id as order_id, o.code as order_code,
       (o.confirmed_at at time zone 'Asia/Ho_Chi_Minh')::date as sold_on,
       v.id as vehicle_id, v.code as vehicle_code, l.vehicle_label, v.business_type,
       l.sale_price, f.purchase_price,
       case when v.business_type = 'owned' and f.purchase_price is not null then l.sale_price - f.purchase_price end as gross_profit,
       case when v.business_type = 'owned' then coalesce(cs.confirmed_showroom, 0) else coalesce(cs.confirmed_owner, 0) end as costs_confirmed,
       coalesce(cs.open_lines, 0) as open_cost_lines,
       case when v.business_type = 'owned' and f.purchase_price is not null then l.sale_price - f.purchase_price - coalesce(cs.confirmed_showroom, 0) end as result_after_costs,
       st.id as settlement_id, st.code as settlement_code, st.status as settlement_status,
       st.distributable, st.company_operating, st.fee_amount
from public.sales_order_lines l
join public.sales_orders o on o.id = l.order_id and o.status = 'confirmed' and l.line_status = 'active'
join public.vehicles v on v.id = l.vehicle_id
left join public.vehicle_financials f on f.vehicle_id = v.id
left join public.vehicle_cost_summary cs on cs.vehicle_id = v.id
left join lateral (select s.id, s.code, s.status, s.distributable, s.company_operating, s.fee_amount
                   from public.settlements s where s.order_line_id = l.id and s.status = 'approved' limit 1) st on true
where private.can_see_finance();

revoke all on public.report_inventory, public.report_vehicle_results from anon;
grant select on public.report_inventory, public.report_vehicle_results to authenticated;

-- Dashboard lãnh đạo: một lần gọi, tổng hợp ở database. Không phải tài chính → trả '{}' (sales/kỹ thuật).
create or replace function public.report_dashboard()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select case when not private.can_see_finance() then '{}'::jsonb else jsonb_build_object(
    'inventory', jsonb_build_object(
      'owned', (select jsonb_build_object(
          'count', count(*), 'capital_tied', coalesce(sum(capital_tied), 0)::text, 'cost_unknown', count(*) filter (where capital_tied is null),
          'open_cost_lines', coalesce(sum(open_cost_lines), 0),
          'age_0_30', count(*) filter (where age_days <= 30), 'age_31_60', count(*) filter (where age_days between 31 and 60),
          'age_61_90', count(*) filter (where age_days between 61 and 90), 'age_91_plus', count(*) filter (where age_days > 90),
          'max_age', max(age_days)) from public.report_inventory where business_type = 'owned'),
      'consignment', (select jsonb_build_object(
          'count', count(*),
          'age_0_30', count(*) filter (where age_days <= 30), 'age_31_60', count(*) filter (where age_days between 31 and 60),
          'age_61_90', count(*) filter (where age_days between 61 and 90), 'age_91_plus', count(*) filter (where age_days > 90),
          'max_age', max(age_days)) from public.report_inventory where business_type = 'consignment'),
      'not_yet_in_stock', (select count(*) from public.vehicles v where v.archived_at is null and v.intake_date is null
                           and v.sale_status not in ('sold', 'delivered', 'returned_to_owner'))),
    'capital_sources', jsonb_build_object(
      'external_capital', (select coalesce(sum(external_capital), 0)::text from public.report_inventory where business_type = 'owned'),
      'loan_outstanding', (select coalesce(sum(loan_outstanding), 0)::text from public.report_inventory where business_type = 'owned'),
      'capital_tied', (select coalesce(sum(capital_tied), 0)::text from public.report_inventory where business_type = 'owned')),
    'money', jsonb_build_object(
      'balance', (select coalesce(sum(balance), 0)::text from public.money_account_balances where is_active),
      'accounts', (select count(*) from public.money_account_balances where is_active)),
    'receivables', jsonb_build_object(
      'orders_outstanding', (select coalesce(sum(outstanding), 0)::text from public.sales_order_balances where status = 'confirmed' and outstanding > 0),
      'orders_count', (select count(*) from public.sales_order_balances where status = 'confirmed' and outstanding > 0),
      'owner_receivable', (select coalesce(sum(remaining), 0)::text from public.settlement_balances where direction = 'in')),
    'payables', jsonb_build_object(
      'settlement_out', (select coalesce(sum(remaining), 0)::text from public.settlement_balances where direction = 'out'),
      'tradein_payable', (select coalesce(sum(payable_total), 0)::text from public.trade_in_balances where status = 'confirmed' and payable_total > 0)),
    'settlements', jsonb_build_object(
      'unsettled_sold', (select count(*) from public.report_vehicle_results where settlement_id is null),
      'pending_approval', (select count(*) from public.settlements where status in ('provisional', 'checked')))
  ) end
$$;

-- Tổng kết quả xe theo kỳ (ngày ký hợp đồng, bao gồm hai đầu). Số thiếu dữ liệu đếm riêng, không cộng như 0.
create or replace function public.report_results_totals(p_from date, p_to date)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with r as (select * from public.report_vehicle_results where sold_on between p_from and p_to),
  g as (select
      coalesce(sum(v.amount) filter (where v.purpose = 'general_expense'), 0) as general_expense,
      coalesce(sum(v.amount) filter (where v.purpose = 'other_expense'), 0) as other_expense,
      coalesce(sum(v.amount) filter (where v.purpose = 'other_income'), 0) as other_income
    from public.cash_vouchers v where v.status = 'posted' and v.occurred_on between p_from and p_to
      and v.purpose in ('general_expense', 'other_expense', 'other_income'))
  select case when not private.can_see_finance() then '{}'::jsonb else jsonb_build_object(
    'lines', (select count(*) from r),
    'owned_lines', (select count(*) from r where business_type = 'owned'),
    'consignment_lines', (select count(*) from r where business_type = 'consignment'),
    'sale_total_owned', (select coalesce(sum(sale_price), 0)::text from r where business_type = 'owned'),
    'gross_profit', (select coalesce(sum(gross_profit), 0)::text from r where business_type = 'owned'),
    'gross_unknown', (select count(*) from r where business_type = 'owned' and gross_profit is null),
    'result_after_costs', (select coalesce(sum(result_after_costs), 0)::text from r where business_type = 'owned'),
    'open_cost_lines', (select coalesce(sum(open_cost_lines), 0) from r),
    'distributable', (select coalesce(sum(distributable), 0)::text from r where business_type = 'owned' and settlement_id is not null),
    'company_operating', (select coalesce(sum(company_operating), 0)::text from r where business_type = 'owned' and settlement_id is not null),
    'owned_unsettled', (select count(*) from r where business_type = 'owned' and settlement_id is null),
    'consignment_fee', (select coalesce(sum(fee_amount), 0)::text from r where business_type = 'consignment' and settlement_id is not null),
    'consignment_unsettled', (select count(*) from r where business_type = 'consignment' and settlement_id is null),
    'general_expense', (select general_expense::text from g),
    'other_expense', (select other_expense::text from g),
    'other_income', (select other_income::text from g),
    'showroom_result', (select (coalesce((select sum(result_after_costs) from r where business_type = 'owned'), 0)
                               + coalesce((select sum(fee_amount) from r where business_type = 'consignment' and settlement_id is not null), 0)
                               - g.general_expense - g.other_expense + g.other_income)::text from g)
  ) end
$$;

revoke execute on function public.report_dashboard() from public, anon;
revoke execute on function public.report_results_totals(date, date) from public, anon;
grant execute on function public.report_dashboard() to authenticated;
grant execute on function public.report_results_totals(date, date) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
