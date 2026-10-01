"use client";

import { useActionState } from "react";
import { acquireFromDemandAction } from "../../kho-xe/actions";
import type { ActionState } from "../actions";
import { FUEL_LABEL } from "@/lib/labels";

type Props = {
  demandId: string; requestId: string; saleMode: string; locations: { id: string; name: string }[];
  offer: { make: string; model: string; variant: string; year: string; color: string; odo: string; vin: string; plate: string; fuel: string; price: string };
};

export function AcquireForm({ demandId, requestId, saleMode, locations, offer }: Props) {
  const [s, action, pending] = useActionState<ActionState, FormData>(acquireFromDemandAction, null);
  const fe = s?.fieldErrors ?? {};
  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="mt-1 block text-xs text-sig-red">{fe[k]}</span> : null);
  const defaultBusiness = saleMode === "consignment" ? "consignment" : saleMode === "undecided" ? "" : "owned";
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="demand_id" value={demandId} /><input type="hidden" name="request_id" value={requestId} />
      {s && !s.ok && <p role="alert" className="text-sm text-sig-red">{s.message}</p>}
      <p className="text-xs text-ink-soft">Điền thông tin showroom <b>đã kiểm tra thực tế</b>. Ô để trống sẽ lấy theo thông tin khách khai (thông tin khách khai vẫn được giữ nguyên ở nhu cầu này).</p>
      <label className="block"><span className="label">Hình thức nhập *</span>
        <select name="business_type" defaultValue={defaultBusiness} className="field">
          <option value="" disabled>— Chọn —</option><option value="owned">Mua đứt / thu cũ đổi mới (showroom sở hữu)</option><option value="consignment">Nhận ký gửi</option>
        </select><Err k="business_type" /></label>
      <label className="block"><span className="label">Giá mua thực tế (nếu mua đứt)</span><input name="purchase_price" className="field" placeholder="650tr" /><Err k="purchase_price" /></label>
      <div className="grid grid-cols-2 gap-2">
        <label><span className="label">Hãng</span><input name="make" className="field" placeholder={offer.make || "Chưa rõ"} /></label>
        <label><span className="label">Model</span><input name="model" className="field" placeholder={offer.model} /></label>
        <label><span className="label">Phiên bản</span><input name="variant" className="field" placeholder={offer.variant} /></label>
        <label><span className="label">Năm SX</span><input name="year_made" className="field" inputMode="numeric" placeholder={offer.year} /><Err k="year_made" /></label>
        <label><span className="label">Màu</span><input name="color" className="field" placeholder={offer.color} /></label>
        <label><span className="label">ODO (km)</span><input name="odo" className="field" inputMode="numeric" placeholder={offer.odo} /><Err k="odo" /></label>
        <label><span className="label">VIN</span><input name="vin" className="field uppercase" placeholder={offer.vin} /><Err k="vin" /></label>
        <label><span className="label">Biển số</span><input name="plate" className="field uppercase" placeholder={offer.plate} /></label>
        <label><span className="label">Nhiên liệu</span>
          <select name="fuel_type" defaultValue="" className="field"><option value="">{offer.fuel || "Giữ theo khách khai"}</option>{Object.entries(FUEL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label><span className="label">Vị trí xe</span>
          <select name="location_id" defaultValue="" className="field"><option value="">Chưa rõ</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label><span className="label">Giá chào bán (nếu đã định)</span><input name="asking_price" className="field" placeholder="Để trống = chưa có giá" /></label>
        <label><span className="label">Ngày nhập kho</span><input type="date" name="intake_date" className="field" /></label>
      </div>
      <label className="block"><span className="label">Ghi chú thẩm định</span><textarea name="notes" rows={2} className="field" /></label>
      <button className="btn btn-primary w-full" disabled={pending}
        onClick={(e) => { if (!window.confirm("Nhập xe này vào kho? Nhu cầu bán sẽ chuyển sang trạng thái đã mua vào / nhận ký gửi.")) e.preventDefault(); }}>
        {pending ? "Đang nhập kho…" : "Nhập kho từ nhu cầu này"}
      </button>
    </form>
  );
}
