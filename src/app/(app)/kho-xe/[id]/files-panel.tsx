"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { archiveVehicleFile, prepareVehicleUpload, registerVehicleFile } from "../file-actions";
import { FILE_CATEGORY_LABEL, isDocumentCategory, validateUpload, type FileCategory } from "@/lib/vehicle-files";
import { publicEnv } from "@/lib/env";
import { formatDate } from "@/lib/dates";
import type { VehicleFileRow } from "./file-load";

type Props = { vehicleId: string; files: VehicleFileRow[]; categories: FileCategory[]; manager: boolean };
const BUCKET = "vehicle-files";
const sizeText = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function FilesPanel({ vehicleId, files, categories, manager }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<string>(categories[0] ?? "photo");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const photos = files.filter((f) => f.category === "photo");
  const videos = files.filter((f) => f.category === "video");
  const docs = files.filter((f) => isDocumentCategory(f.category));

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    const list = Array.from(input.current?.files ?? []);
    if (!list.length) { setMsg({ ok: false, text: "Chọn tệp cần tải lên." }); return; }
    setBusy(true); setMsg(null);
    const { url, key } = publicEnv();
    const storage = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(BUCKET);
    let done = 0;
    for (const file of list) {
      const mime = file.type || "";
      const invalid = validateUpload(category, mime, file.size);
      if (invalid) { setMsg({ ok: false, text: `${file.name}: ${invalid}` }); break; }
      const prep = await prepareVehicleUpload({ vehicleId, category, fileName: file.name, mimeType: mime, size: file.size });
      if (!prep.ok) { setMsg({ ok: false, text: `${file.name}: ${prep.message}` }); break; }
      const up = await storage.uploadToSignedUrl(prep.path, prep.token, file, { contentType: mime });
      if (up.error) { setMsg({ ok: false, text: `${file.name}: tải lên không thành công, thử lại.` }); break; }
      const reg = await registerVehicleFile({ requestId: prep.requestId, vehicleId, category, path: prep.path, fileName: file.name, mimeType: mime, size: file.size });
      if (!reg.ok) { setMsg({ ok: false, text: `${file.name}: ${reg.message}` }); break; }
      done += 1;
    }
    setBusy(false);
    if (done > 0) {
      if (input.current) input.current.value = "";
      setMsg((m) => m ?? { ok: true, text: `Đã tải lên ${done} tệp.` });
      router.refresh();
    }
  }

  async function onArchive(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!window.confirm("Lưu trữ tệp này? Tệp không hiện nữa nhưng vẫn được giữ lại, không xóa.")) return;
    const r = await archiveVehicleFile(new FormData(e.currentTarget));
    setMsg({ ok: r.ok, text: r.message ?? "" });
    if (r.ok) router.refresh();
  }

  const Archive = ({ f }: { f: VehicleFileRow }) => manager ? (
    <form onSubmit={onArchive} className="mt-1 flex gap-1">
      <input type="hidden" name="file_id" value={f.id} /><input type="hidden" name="vehicle_id" value={vehicleId} />
      <input name="reason" placeholder="Lý do lưu trữ" aria-label="Lý do lưu trữ tệp" className="field !w-40 !py-0.5 text-xs" required />
      <button className="btn btn-ghost !px-2 !py-0.5 text-xs">Lưu trữ</button>
    </form>
  ) : null;

  return (
    <div className="space-y-4">
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-sig-green" : "text-sig-red"}`}>{msg.text}</p>}

      <div>
        <h3 className="mb-1 text-sm font-semibold">Ảnh ({photos.length})</h3>
        {photos.length === 0 ? <p className="text-sm text-ink-soft">Chưa có ảnh.</p> : (
          <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {photos.map((f) => (
              <li key={f.id} className="rounded-md border border-line p-1">
                {f.url ? (
                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL ký tạm thời, không dùng bộ tối ưu ảnh của Next */}
                    <img src={f.url} alt={f.caption || f.file_name} loading="lazy" className="aspect-[4/3] w-full rounded object-cover" />
                  </a>
                ) : <span className="text-xs text-ink-soft">{f.file_name}</span>}
                <p className="truncate text-xs text-ink-soft">{formatDate(f.created_at)} · {sizeText(f.size_bytes)}</p>
                <Archive f={f} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {videos.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Video ({videos.length})</h3>
          <ul className="space-y-1 text-sm">
            {videos.map((f) => (
              <li key={f.id}>{f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-petrol hover:underline">{f.file_name}</a> : f.file_name}
                <span className="text-xs text-ink-soft"> · {formatDate(f.created_at)} · {sizeText(f.size_bytes)}</span><Archive f={f} /></li>
            ))}
          </ul>
        </div>
      )}

      {docs.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Giấy tờ ({docs.length})</h3>
          <ul className="space-y-1 text-sm">
            {docs.map((f) => (
              <li key={f.id}><span className="text-xs text-ink-soft">{FILE_CATEGORY_LABEL[f.category]}: </span>
                {f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-petrol hover:underline">{f.file_name}</a> : f.file_name}
                <span className="text-xs text-ink-soft"> · {formatDate(f.created_at)} · {sizeText(f.size_bytes)}</span><Archive f={f} /></li>
            ))}
          </ul>
        </div>
      )}

      {categories.length > 0 && (
        <form onSubmit={onUpload} className="grid gap-2 rounded-md border border-line p-3 md:grid-cols-[14rem_1fr_auto]">
          <label><span className="label">Loại tệp</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="field" disabled={busy}>
              {categories.map((c) => <option key={c} value={c}>{FILE_CATEGORY_LABEL[c]}</option>)}
            </select></label>
          <label><span className="label">Chọn tệp (có thể chọn nhiều)</span>
            <input ref={input} type="file" multiple className="block w-full text-sm" disabled={busy}
              accept={category === "video" ? "video/mp4,video/quicktime" : category === "photo" ? "image/*" : "image/*,application/pdf"} /></label>
          <button className="btn btn-primary self-end" disabled={busy}>{busy ? "Đang tải lên…" : "Tải lên"}</button>
          <p className="text-xs text-ink-soft md:col-span-3">
            Ảnh tối đa 20 MB, video tối đa 50 MB (MP4/MOV), giấy tờ là ảnh chụp hoặc PDF tối đa 20 MB. Tệp riêng tư; đường dẫn xem chỉ có hiệu lực 10 phút. Tệp không bị xóa, chỉ lưu trữ.
            {categories.some(isDocumentCategory) ? "" : " Giấy tờ chỉ quản lý/kế toán được xem và thêm."}
          </p>
        </form>
      )}
    </div>
  );
}
