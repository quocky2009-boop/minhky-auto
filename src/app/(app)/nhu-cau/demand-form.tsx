"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { ActionState } from "./actions";
import { checkPhone, createDemand, updateDemand } from "./actions";
import { CRITERIA_LABEL, FUEL_LABEL, SALE_MODE_LABEL } from "@/lib/labels";
import type { Catalog, Option } from "@/lib/demands/data";

export type DemandFormValues = {
  [k: string]: string | string[] | { make: string; model: string; variant: string }[] | undefined;
  options?: { make: string; model: string; variant: string }[];
};
type Dup = Awaited<ReturnType<typeof checkPhone>>[number];

type Props = {
  mode: "create" | "update";
  requestId?: string;
  demandId?: string;
  version?: number;
  initial: DemandFormValues;
  catalog: Catalog;
  sources: Option[];
  sellers: Option[];
  canAssign: boolean;
  me: string;
  presetCustomer?: { id: string; name: string; phone: string | null } | null;
};

const TRI = [["", "Chưa rõ"], ["true", "Có"], ["false", "Không"]] as const;

export function DemandForm(p: Props) {
  const v = p.initial;
  const val = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
  const arr = (k: string) => (Array.isArray(v[k]) ? (v[k] as unknown[]).filter((x): x is string => typeof x === "string") : []);

  const [kind, setKind] = useState<"buy" | "sell">((val("kind") as "buy" | "sell") || "buy");
  const [customer, setCustomer] = useState(p.presetCustomer ?? null);
  const [dups, setDups] = useState<Dup[]>([]);
  const [options, setOptions] = useState(v.options?.length ? v.options : [{ make: "", model: "", variant: "" }]);
  const [offerMake, setOfferMake] = useState(val("s_make"));
  const [offerModel, setOfferModel] = useState(val("s_model"));
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const fe = state?.fieldErrors ?? {};

  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ").trim();
  const modelsFor = useMemo(() => (make: string) => {
    const mk = p.catalog.makes.find((m) => norm(m.name) === norm(make));
    return mk ? p.catalog.models.filter((m) => m.make_id === mk.id) : [];
  }, [p.catalog]);
  const variantsFor = (make: string, model: string) => {
    const md = modelsFor(make).find((m) => norm(m.name) === norm(model));
    return md ? p.catalog.variants.filter((x) => x.model_id === md.id) : [];
  };

  async function onPhoneBlur(phone: string) {
    if (customer || phone.replace(/\D/g, "").length < 9) return setDups([]);
    setDups(await checkPhone(phone));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = p.mode === "create" ? await createDemand(fd) : await updateDemand(fd);
      setState(res); // chỉ tới đây khi lỗi; thành công thì máy chủ chuyển trang
      if (res && !res.ok) window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="mt-1 block text-xs text-sig-red">{fe[k]}</span> : null);
  const triSelect = (name: string, label: string) => (
    <label><span className="label">{label}</span>
      <select name={name} defaultValue={val(name)} className="field">{TRI.map(([x, l]) => <option key={x} value={x}>{l}</option>)}</select>
    </label>
  );

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {state && !state.ok && <div role="alert" className="panel border-[#e5b4ae] bg-[#fdf3f2] px-4 py-3 text-sm text-sig-red">{state.message}</div>}
      {p.mode === "create" && <input type="hidden" name="request_id" value={p.requestId} />}
      {p.mode === "update" && (<><input type="hidden" name="id" value={p.demandId} /><input type="hidden" name="version" value={p.version} /></>)}
      <input type="hidden" name="kind" value={kind} />

      {p.mode === "create" && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Loại nhu cầu">
          {(["buy", "sell"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              className={`rounded-lg border px-4 py-3 text-left ${kind === k ? "border-petrol bg-petrol-wash" : "border-line bg-surface"}`}>
              <span className="block font-semibold">{k === "buy" ? "Khách cần mua" : "Khách cần bán"}</span>
              <span className="text-xs text-ink-soft">{k === "buy" ? "Tìm xe theo tiêu chí khách" : "Xe khách chào bán / ký gửi / đổi"}</span>
            </button>
          ))}
        </div>
      )}

      {/* ---------------- Khách hàng ---------------- */}
      {p.mode === "create" && (
        <section className="panel space-y-3 p-4">
          <h2 className="font-semibold">Khách hàng</h2>
          {customer ? (
            <div className="flex items-center justify-between rounded-md bg-petrol-wash px-3 py-2 text-sm">
              <input type="hidden" name="customer_id" value={customer.id} />
              <span><b>{customer.name}</b>{customer.phone ? ` · ${customer.phone}` : ""} <span className="text-ink-soft">(khách đã có)</span></span>
              <button type="button" className="text-petrol underline" onClick={() => setCustomer(null)}>Đổi</button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <label><span className="label">Số điện thoại</span>
                <input name="c_phone" defaultValue={val("c_phone")} inputMode="tel" autoComplete="off" className="field" placeholder="0912 345 678"
                  onBlur={(e) => onPhoneBlur(e.target.value)} />
                <Err k="c_phone" />
              </label>
              <label><span className="label">Tên khách *</span>
                <input name="c_name" defaultValue={val("c_name")} className="field" placeholder="Anh Tuấn" /><Err k="c_name" />
              </label>
              {dups.length > 0 && (
                <div className="rounded-md border border-sig-amber bg-[#fdf7e6] p-3 text-sm md:col-span-2">
                  <p className="font-medium">Số này đã có trong hệ thống — kiểm tra trước khi tạo khách mới:</p>
                  <ul className="mt-2 space-y-1.5">
                    {dups.map((d) => (
                      <li key={d.customer_id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>{d.code} · {d.display_name}{d.owner_name ? ` · phụ trách: ${d.owner_name}` : ""}</span>
                        <button type="button" className="btn btn-ghost !py-1 text-sm"
                          onClick={() => { setCustomer({ id: d.customer_id, name: d.display_name, phone: null }); setDups([]); }}>
                          Dùng khách này
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-ink-soft">Không tự gộp khách. Nếu là người khác dùng chung số, cứ tiếp tục nhập khách mới.
                    {dups.some((d) => !d.can_open) && " Khách của đồng nghiệp: nhu cầu mới vẫn do anh/chị phụ trách; hồ sơ khách vẫn thuộc người phụ trách cũ."}</p>
                </div>
              )}
              <label><span className="label">Khu vực</span><input name="c_area" defaultValue={val("c_area")} className="field" placeholder="TP Tuyên Quang" /></label>
              <label><span className="label">Địa chỉ</span><input name="c_address" defaultValue={val("c_address")} className="field" /></label>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            <label><span className="label">Nguồn khách</span>
              <select name="source_id" defaultValue={val("source_id")} className="field">
                <option value="">Chưa rõ</option>{p.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label><span className="label">Ưu tiên</span>
              <select name="priority" defaultValue={val("priority") || "normal"} className="field">
                <option value="high">Cao</option><option value="normal">Bình thường</option><option value="low">Thấp</option>
              </select>
            </label>
            {p.canAssign && (
              <label><span className="label">Người phụ trách</span>
                <select name="owner_id" defaultValue={p.me} className="field">
                  {p.sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}
          </div>
        </section>
      )}
      {p.mode === "update" && (
        <section className="panel grid gap-3 p-4 md:grid-cols-2">
          <label><span className="label">Nguồn khách</span>
            <select name="source_id" defaultValue={val("source_id")} className="field">
              <option value="">Chưa rõ</option>{p.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label><span className="label">Ưu tiên</span>
            <select name="priority" defaultValue={val("priority") || "normal"} className="field">
              <option value="high">Cao</option><option value="normal">Bình thường</option><option value="low">Thấp</option>
            </select>
          </label>
        </section>
      )}

      {/* ---------------- Cần mua ---------------- */}
      {kind === "buy" && (
        <section className="panel space-y-4 p-4">
          <div>
            <h2 className="font-semibold">Xe khách muốn mua</h2>
            <p className="text-xs text-ink-soft">Một hoặc nhiều phương án chấp nhận. Gõ tên mới nếu danh mục chưa có.</p>
          </div>
          <datalist id="dl-makes">{p.catalog.makes.map((m) => <option key={m.id} value={m.name} />)}</datalist>
          {options.map((o, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
              <label><span className="label">{i === 0 ? "Hãng" : `Hãng (PA ${i + 1})`}</span>
                <input name="opt_make" list="dl-makes" value={o.make} className="field" placeholder="VinFast"
                  onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, make: e.target.value } : x)))} />
                <Err k={`opt_make_${i}`} />
              </label>
              <label><span className="label">Model</span>
                <input name="opt_model" list={`dl-models-${i}`} value={o.model} className="field" placeholder="VF 8"
                  onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, model: e.target.value } : x)))} />
                <datalist id={`dl-models-${i}`}>{modelsFor(o.make).map((m) => <option key={m.id} value={m.name} />)}</datalist>
              </label>
              <label><span className="label">Phiên bản</span>
                <input name="opt_variant" list={`dl-variants-${i}`} value={o.variant} className="field" placeholder="Plus"
                  onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, variant: e.target.value } : x)))} />
                <datalist id={`dl-variants-${i}`}>{variantsFor(o.make, o.model).map((m) => <option key={m.id} value={m.name} />)}</datalist>
              </label>
              <button type="button" className="btn btn-ghost !px-3" aria-label="Xóa phương án" disabled={options.length === 1}
                onClick={() => setOptions(options.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button type="button" className="text-sm font-medium text-petrol" onClick={() => setOptions([...options, { make: "", model: "", variant: "" }])}>
            + Thêm phương án xe
          </button>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <label><span className="label">Ngân sách từ</span><input name="budget_min" defaultValue={val("budget_min")} className="field" placeholder="600tr" /><Err k="budget_min" /></label>
            <label><span className="label">Ngân sách đến</span><input name="budget_max" defaultValue={val("budget_max")} className="field" placeholder="700tr" /><Err k="budget_max" /></label>
            <label><span className="label">Đời từ năm</span><input name="year_min" defaultValue={val("year_min")} inputMode="numeric" className="field" placeholder="2021" /><Err k="year_min" /></label>
            <label><span className="label">đến năm</span><input name="year_max" defaultValue={val("year_max")} inputMode="numeric" className="field" placeholder="2023" /><Err k="year_max" /></label>
            <label className="col-span-2"><span className="label">Màu chấp nhận</span>
              <input name="colors_accepted" defaultValue={val("colors_accepted")} list="dl-colors" className="field" placeholder="trắng, đen" /></label>
            <label className="col-span-2"><span className="label">Màu không muốn</span>
              <input name="colors_rejected" defaultValue={val("colors_rejected")} className="field" placeholder="đỏ" /></label>
            <datalist id="dl-colors">{p.catalog.colors.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <p className="-mt-2 text-xs text-ink-soft">Bỏ trống nếu khách chưa nói — hệ thống ghi “Chưa rõ”, không coi là 0. Nhiều màu cách nhau bằng dấu phẩy.</p>

          <fieldset>
            <legend className="label">Tiêu chí bắt buộc (không được lệch khi gợi ý xe)</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
              {Object.entries(CRITERIA_LABEL).map(([k, l]) => (
                <label key={k} className="inline-flex items-center gap-1.5">
                  <input type="checkbox" name="strict_criteria" value={k}
                    defaultChecked={p.mode === "create" && !v.strict_criteria ? k === "model" : arr("strict_criteria").includes(k)} /> {l}
                </label>
              ))}
            </div>
          </fieldset>

          <details>
            <summary className="cursor-pointer text-sm font-medium text-petrol">Chi tiết thêm (ODO, nhiên liệu, số chỗ, vay, đổi xe…)</summary>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <label><span className="label">ODO tối đa (km)</span><input name="odo_max" defaultValue={val("odo_max")} inputMode="numeric" className="field" /><Err k="odo_max" /></label>
              <label><span className="label">Mới / cũ</span>
                <select name="condition_pref" defaultValue={val("condition_pref")} className="field">
                  <option value="">Chưa rõ</option><option value="new">Xe mới</option><option value="used">Đã qua sử dụng</option><option value="any">Mới hoặc cũ</option>
                </select>
              </label>
              {triSelect("needs_loan", "Cần vay")}
              {triSelect("wants_trade_in", "Đổi xe cũ")}
              <fieldset className="col-span-2">
                <legend className="label">Nhiên liệu</legend>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {Object.entries(FUEL_LABEL).map(([k, l]) => (
                    <label key={k} className="inline-flex items-center gap-1"><input type="checkbox" name="fuel_types" value={k} defaultChecked={arr("fuel_types").includes(k)} /> {l}</label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="col-span-2">
                <legend className="label">Số chỗ</legend>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {["2", "4", "5", "7", "8", "16"].map((k) => (
                    <label key={k} className="inline-flex items-center gap-1"><input type="checkbox" name="seats" value={k} defaultChecked={arr("seats").includes(k)} /> {k}</label>
                  ))}
                </div>
              </fieldset>
              <label className="col-span-2"><span className="label">Dự kiến mua</span><input name="expected_timeframe" defaultValue={val("expected_timeframe")} className="field" placeholder="Trong tháng / sau Tết…" /></label>
              <label className="col-span-2"><span className="label">Hạn dự kiến</span><input type="date" name="expected_by" defaultValue={val("expected_by")} className="field" /></label>
              <label className="col-span-2"><span className="label">Yêu cầu bắt buộc khác</span><textarea name="must_have_note" defaultValue={val("must_have_note")} rows={2} className="field" /></label>
              <label className="col-span-2"><span className="label">Có thể linh hoạt</span><textarea name="flexible_note" defaultValue={val("flexible_note")} rows={2} className="field" /></label>
            </div>
          </details>
        </section>
      )}

      {/* ---------------- Cần bán ---------------- */}
      {kind === "sell" && (
        <section className="panel space-y-4 p-4">
          <div>
            <h2 className="font-semibold">Xe khách muốn bán</h2>
            <p className="text-xs text-ink-soft">Đây là <b>thông tin khách cung cấp</b>, chưa được showroom kiểm tra. Xe chưa thu mua không phải xe trong kho.</p>
          </div>
          <datalist id="dl-makes-s">{p.catalog.makes.map((m) => <option key={m.id} value={m.name} />)}</datalist>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <label><span className="label">Hãng</span><input name="s_make" list="dl-makes-s" value={offerMake} onChange={(e) => setOfferMake(e.target.value)} className="field" /><Err k="s_make" /></label>
            <label><span className="label">Model</span>
              <input name="s_model" list="dl-models-s" value={offerModel} onChange={(e) => setOfferModel(e.target.value)} className="field" />
              <datalist id="dl-models-s">{modelsFor(offerMake).map((m) => <option key={m.id} value={m.name} />)}</datalist>
            </label>
            <label><span className="label">Phiên bản</span>
              <input name="s_variant" list="dl-variants-s" defaultValue={val("s_variant")} className="field" />
              <datalist id="dl-variants-s">{variantsFor(offerMake, offerModel).map((m) => <option key={m.id} value={m.name} />)}</datalist>
            </label>
            <label><span className="label">Năm sản xuất</span><input name="s_year_made" defaultValue={val("s_year_made")} inputMode="numeric" className="field" /><Err k="s_year_made" /></label>
            <label><span className="label">Giá khách muốn</span><input name="s_price" defaultValue={val("s_price")} className="field" placeholder="620tr" /><Err k="s_price" /></label>
            {triSelect("s_negotiable", "Thương lượng được")}
            <label><span className="label">Màu</span><input name="s_color" defaultValue={val("s_color")} list="dl-colors-s" className="field" />
              <datalist id="dl-colors-s">{p.catalog.colors.map((c) => <option key={c} value={c} />)}</datalist></label>
            <label><span className="label">ODO (km)</span><input name="s_odo" defaultValue={val("s_odo")} inputMode="numeric" className="field" /><Err k="s_odo" /></label>
            <label><span className="label">Hình thức</span>
              <select name="s_sale_mode" defaultValue={val("s_sale_mode") || "undecided"} className="field">
                {Object.entries(SALE_MODE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label><span className="label">Hẹn thẩm định</span><input type="datetime-local" name="s_inspection_at" defaultValue={val("s_inspection_at")} className="field" /><Err k="s_inspection_at" /></label>
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-medium text-petrol">Chi tiết thêm (biển số, VIN, hồ sơ, khoản vay…)</summary>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <label><span className="label">Năm đăng ký</span><input name="s_year_registered" defaultValue={val("s_year_registered")} inputMode="numeric" className="field" /></label>
              <label><span className="label">Nhiên liệu</span>
                <select name="s_fuel" defaultValue={val("s_fuel")} className="field"><option value="">Chưa rõ</option>
                  {Object.entries(FUEL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </label>
              <label><span className="label">Số chỗ</span><input name="s_seats" defaultValue={val("s_seats")} inputMode="numeric" className="field" /></label>
              <label><span className="label">Biển số</span><input name="s_plate" defaultValue={val("s_plate")} className="field" /></label>
              <label className="col-span-2"><span className="label">VIN</span><input name="s_vin" defaultValue={val("s_vin")} className="field" /></label>
              {triSelect("s_has_loan", "Còn vay trên xe")}
              <label><span className="label">Dư nợ còn lại</span><input name="s_loan_remaining" defaultValue={val("s_loan_remaining")} className="field" /><Err k="s_loan_remaining" /></label>
              <label className="col-span-2"><span className="label">Nơi đang để xe</span><input name="s_location" defaultValue={val("s_location")} className="field" /></label>
              <label className="col-span-2"><span className="label">Thời điểm muốn bán</span><input name="s_sell_time" defaultValue={val("s_sell_time")} className="field" /></label>
              <label className="col-span-2"><span className="label">Tình trạng xe (khách kể)</span><textarea name="s_condition_note" defaultValue={val("s_condition_note")} rows={2} className="field" /></label>
              <label className="col-span-2"><span className="label">Lịch sử sửa chữa (khách kể)</span><textarea name="s_repair_note" defaultValue={val("s_repair_note")} rows={2} className="field" /></label>
              <label className="col-span-4"><span className="label">Hồ sơ giấy tờ</span><input name="s_papers_note" defaultValue={val("s_papers_note")} className="field" /></label>
            </div>
          </details>
        </section>
      )}

      {/* ---------------- Tin nhắn gốc / việc tiếp theo ---------------- */}
      <section className="panel space-y-3 p-4">
        <label className="block"><span className="label">Tin nhắn gốc (dán từ Zalo để đối chiếu)</span>
          <textarea name="raw_message" defaultValue={val("raw_message")} rows={3} className="field" /></label>
        <label className="block"><span className="label">Ghi chú</span><textarea name="notes" defaultValue={val("notes")} rows={2} className="field" /></label>
        {p.mode === "create" && (
          <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
            <label><span className="label">Việc tiếp theo</span><input name="next_action" defaultValue={val("next_action")} className="field" placeholder="Gọi lại xác nhận ngân sách" /></label>
            <label><span className="label">Hạn</span><input type="datetime-local" name="next_action_due" defaultValue={val("next_action_due")} className="field" /><Err k="next_action_due" /></label>
          </div>
        )}
      </section>

      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-line bg-floor/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <button className="btn btn-primary flex-1 md:flex-none" disabled={pending}>{pending ? "Đang lưu…" : p.mode === "create" ? "Lưu nhu cầu" : "Lưu thay đổi"}</button>
        <Link href={p.mode === "create" ? "/nhu-cau" : `/nhu-cau/${p.demandId}`} className="btn btn-ghost">Hủy</Link>
      </div>
    </form>
  );
}
