-- =====================================================================
-- DỮ LIỆU DEMO — CHỈ dùng cho project thử nghiệm (staging). KHÔNG chạy trên production.
-- Toàn bộ tên khách, số điện thoại, giá là GIẢ (đầu số 0900 000 xxx), không phải dữ liệu thật.
-- Cách chạy trong SQL Editor (cùng một lần chạy):
--   set minhky.allow_demo = 'yes';
--   <dán nội dung file này>
-- Yêu cầu: đã có ít nhất 1 tài khoản có vai trò sales hoặc manager (đã tạo qua app).
-- =====================================================================
do $$
declare
  v_owner uuid;
  v_make uuid; v_model uuid;
  v_v uuid;
begin
  if coalesce(current_setting('minhky.allow_demo', true), '') <> 'yes' then
    raise exception 'Chặn an toàn: chạy "set minhky.allow_demo = ''yes'';" trước, và CHỈ trên project thử nghiệm.';
  end if;
  if exists (select 1 from public.customers where full_name like '[DEMO]%') then
    raise exception 'Dữ liệu demo đã có, không nạp lại.';
  end if;
  select ur.user_id into v_owner from public.user_roles ur join public.profiles p on p.id = ur.user_id
    where p.is_active and ur.role in ('sales', 'manager') order by ur.role desc limit 1;
  if v_owner is null then raise exception 'Chưa có nhân viên sales/manager để giao dữ liệu demo.'; end if;

  -- Nhu cầu mua / bán (giả lập phiên đăng nhập của nhân viên để RLS và trigger chạy như thật)
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform public.create_demand(jsonb_build_object('request_id', gen_random_uuid(), 'kind', 'buy',
    'customer', jsonb_build_object('full_name', '[DEMO] Anh Hùng', 'phone', '0900000001', 'area', 'TP Tuyên Quang'),
    'options', jsonb_build_array(jsonb_build_object('make', 'VinFast', 'model', 'VF 8'), jsonb_build_object('make', 'MG', 'model', 'MG ZS')),
    'budget_min', '600000000', 'budget_max', '700000000', 'year_min', '2022', 'colors_accepted', jsonb_build_array('trắng', 'đen'),
    'strict_criteria', jsonb_build_array('model'), 'next_action', 'Gọi lại xác nhận ngân sách', 'next_action_due', (now() + interval '1 day')::text,
    'raw_message', 'Em ơi anh cần VF8 hoặc ZS tầm 6-7 trăm, màu trắng hoặc đen'));
  perform public.create_demand(jsonb_build_object('request_id', gen_random_uuid(), 'kind', 'sell',
    'customer', jsonb_build_object('full_name', '[DEMO] Chị Mai', 'phone', '0900000002', 'area', 'Yên Sơn'),
    'sell_offer', jsonb_build_object('make', 'VinFast', 'model', 'VF 8', 'year_made', '2023', 'color', 'trắng', 'odo', '18000',
      'asking_price', '650000000', 'sale_mode', 'trade_in'),
    'wants_trade_in', true, 'next_action', 'Hẹn thẩm định xe', 'next_action_due', (now() - interval '1 day')::text));
  perform public.create_demand(jsonb_build_object('request_id', gen_random_uuid(), 'kind', 'buy',
    'customer', jsonb_build_object('full_name', '[DEMO] Anh Tuấn Zalo'),
    'options', jsonb_build_array(jsonb_build_object('make', 'MG', 'model', 'MG5')), 'budget_max', '500000000'));
  perform set_config('request.jwt.claims', '', true);

  -- Một xe trong kho để thấy gợi ý "xe sẵn bán" (quyền hệ thống)
  select make_id, model_id into v_make, v_model from public.resolve_vehicle_spec('VinFast', 'VF 8');
  insert into public.vehicles (make_id, model_id, condition, business_type, source_type, sale_status, year_made, color, odo, intake_date, notes)
    values (v_make, v_model, 'used', 'owned', 'individual', 'available', 2023, 'trắng', 15000, current_date - 20, '[DEMO]')
    returning id into v_v;
  insert into public.vehicle_listings (vehicle_id, asking_price, listed_at) values (v_v, 655000000, now());
  raise notice 'Đã nạp dữ liệu demo cho nhân viên %', v_owner;
end $$;
