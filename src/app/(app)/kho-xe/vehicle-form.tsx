"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { ActionState } from "../nhu-cau/actions";
import { createVehicleAction, updateVehicleAction } from "./actions";
import { FUEL_LABEL, PREP_LABEL, SOURCE_TYPE_LABEL, PAPERWORK_LABEL } from "@/lib/labels";
import type { Catalog } from "@/lib/demands/data";

type Props = {
  mode: "create" | "update";
  requestId?: string; vehicleId?: string; version?: number;
  initial: Record<string, string>;
  catalog: Catalog; locations: { id: string; name: string }[];
  showFinance: boolean;
};

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ").trim();

export function VehicleForm(p: Props) {
  const v = (k: string) => p.initial[k] ?? "";
  const [business, setBusiness] = useState(v("business_type") || "owned");
  const [make, setMake] = useState(v("make"));
  const [model, setModel] = useState(v("model"));
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const fe = state?.fieldErrors ?? {};
  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="mt-1 block text-xs text-sig-red">{fe[k]}</span> : null);

  const mk = p.catalog.makes.find((m) => norm(m.name) === norm(make));
  const models = mk ? p.catalog.models.filter((m) => m.make_id === mk.id) : [];
  const md = models.find((m) => norm(m.name) === norm(model));
  const variants = md ? p.catalog.variants.filter((x) => x.model_id === md.id) : [];

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = p.mode === "create" ? await createVehicleAction(fd) : await updateVehicleAction(fd);
      setState(res);
      if (res && !res.ok) window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {state && !state.ok && <div role="alert" className="panel border-[#e5b4ae] bg-[#fdf3f2] px-4 py-3 text-sm text-sig-red">{state.message}</div>}
      {p.mode === "create" ? <input type="hidden" name="request_id" value={p.requestId} />
        : (<><input type="hidden" name="id" value={p.vehicleId} /><input type="hidden" name="version" value={p.version} /><input type="hidden" name="business_type_locked" value={v("business_type")} /></>)}

      <section className="panel space-y-3 p-4">
        <h2 className="font-semibold">Thông tin xe</h2>
        <datalist id="vf-makes">{p.catalog.makes.map((m) => <option key={m.id} value={m.name} />)}</datalist>
        <datalist id="vf-models">{models.map((m) => <option key={m.id} value={m.name} />)}</datalist>
        <datalist id="vf-variants">{variants.map((m) => <option key={m.id} value={m.name} />)}</datalist>
        <datalist id="vf-colors">{p.catalog.colors.map((c) => <option key={c} value={c} />)}</datalist>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label><span className="label">Hãng *</span><input name="make" list="vf-makes" value={make} onChange={(e) => setMake(e.target.value)} className="field" /><Err k="make" /></label>
          <label><span className="label">Model</span><input name="model" list="vf-models" value={model} onChange={(e) => setModel(e.target.value)} className="field" /></label>
          <label><span className="label">Phiên bản</span><input name="variant" list="vf-variants" defaultValue={v("variant")} className="field" /></label>
          <label><span className="label">Năm sản xuất</span><input name="year_made" defaultValue={v("year_made")} inputMode="numeric" className="field" /><Err k="year_made" /></label>
          <label><span className="label">Năm đăng ký</span><input name="year_registered" defaultValue={v("year_registered")} inputMode="numeric" className="field" /><Err k="year_registered" /></label>
          <label><span className="label">Màu</span><input name="color" list="vf-colors" defaultValue={v("color")} className="field" /></label>
          <label><span className="label">ODO (km)</span><input name="odo" defaultValue={v("odo")} inputMode="numeric" className="field" /><Err k="odo" /></label>
          <label><span className="label">Nhiên liệu</span>
            <select name="fuel_type" defaultValue={v("fuel_type")} className="field"><option value="">Chưa rõ</option>{Object.entries(FUEL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label><span className="label">Số chỗ</span><input name="seats" defaultValue={v("seats")} inputMode="numeric" className="field" /><Err k="seats" /></label>
          <label className="col-span-2"><span className="label">Số VIN / số khung</span><input name="vin" defaultValue={v("vin")} className="field uppercase" placeholder="Có thể để trống nếu xe chưa về" /><Err k="vin" /></label>
          <label><span className="label">Biển số</span><input name="plate" defaultValue={v("plate")} className="field uppercase" /></label>
        </div>
      </section>

      <section className="panel space-y-3 p-4">
        <h2 className="font-semibold">Phân loại và tình trạng</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {p.mode === "create" ? (
            <>
              <label><span className="label">Mới / cũ *</span>
                <select name="condition" defaultValue={v("condition")} className="field"><option value="">— Chọn —</option><option value="new">Xe mới</option><option value="used">Đã qua sử dụng</option></select><Err k="condition" /></label>
              <label><span className="label">Hình thức *</span>
                <select name="business_type" value={business} onChange={(e) => setBusiness(e.target.value)} className="field"><option value="owned">Showroom sở hữu</option><option value="consignment">Ký gửi</option></select><Err k="business_type" /></label>
            </>
          ) : (
            <>
              <label><span className="label">Mới / cũ</span>
                <select name="condition" defaultValue={v("condition")} className="field"><option value="new">Xe mới</option><option value="used">Đã qua sử dụng</option></select></label>
              <div><span className="label">Hình thức</span><p className="field !bg-floor">{business === "consignment" ? "Ký gửi" : "Showroom sở hữu"}</p><p className="mt-1 text-xs text-ink-soft">Không đổi được sau khi nhập.</p></div>
            </>
          )}
          <label><span className="label">Nguồn xe</span>
            <select name="source_type" defaultValue={v("source_type")} className="field"><option value="">Chưa rõ</option>{Object.entries(SOURCE_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label><span className="label">Ngày nhập kho</span><input type="date" name="intake_date" defaultValue={v("intake_date")} className="field" /><Err k="intake_date" /></label>
          <label><span className="label">Vị trí</span>
            <select name="location_id" defaultValue={v("location_id")} className="field"><option value="">Chưa rõ</option>{p.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label><span className="label">Chuẩn bị bán</span>
            <select name="prep_status" defaultValue={v("prep_status") || "pending"} className="field">{Object.entries(PREP_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label><span className="label">Hồ sơ giấy tờ</span>
            <select name="paperwork_status" defaultValue={v("paperwork_status") || "incomplete"} className="field">{Object.entries(PAPERWORK_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {p.mode === "update" && (
            <label><span className="label">Bán hàng</span>
              <select name="sale_status" defaultValue={v("sale_status")} className="field" disabled={!["not_listed", "available"].includes(v("sale_status"))}>
                <option value="not_listed">Chưa chào bán</option><option value="available">Đang bán</option>
                {!["not_listed", "available"].includes(v("sale_status")) && <option value={v("sale_status")}>{v("sale_status_label")}</option>}
              </select>
              {!["not_listed", "available"].includes(v("sale_status")) && <p className="mt-1 text-xs text-ink-soft">Do nghiệp vụ giữ xe/cọc/bán đặt (chặng 5).</p>}
            </label>
          )}
        </div>
        <label className="block"><span className="label">Ghi chú</span><textarea name="notes" defaultValue={v("notes")} rows={2} className="field" /></label>
      </section>

      <section className="panel space-y-3 p-4">
        <h2 className="font-semibold">Giá</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label><span className="label">Giá chào bán</span><input name="asking_price" defaultValue={v("asking_price")} className="field" placeholder="650tr" /><Err k="asking_price" /></label>
          {p.showFinance && business !== "consignment" && (
            <label><span className="label">Giá mua (nội bộ)</span><input name="purchase_price" defaultValue={v("purchase_price")} className="field" /><Err k="purchase_price" /></label>
          )}
          {p.showFinance && (
            <label><span className="label">Giá sàn (nội bộ)</span><input name="floor_price" defaultValue={v("floor_price")} className="field" /><Err k="floor_price" /></label>
          )}
        </div>
        <p className="text-xs text-ink-soft">
          Giá mua và giá sàn chỉ quản lý/kế toán xem được; nhân viên bán hàng chỉ thấy giá chào. Bỏ trống = chưa rõ (không phải 0).
          {business === "consignment" && " Xe ký gửi không có giá mua của showroom — giá chủ xe muốn nhận ghi trong hợp đồng ký gửi."}
        </p>
      </section>

      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-line bg-floor/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <button className="btn btn-primary flex-1 md:flex-none" disabled={pending}>{pending ? "Đang lưu…" : p.mode === "create" ? "Nhập xe vào kho" : "Lưu thay đổi"}</button>
        <Link href={p.mode === "create" ? "/kho-xe" : `/kho-xe/${p.vehicleId}`} className="btn btn-ghost">Hủy</Link>
      </div>
    </form>
  );
}
