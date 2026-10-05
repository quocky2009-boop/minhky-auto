"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { prepareAttachmentUpload, reassignDemand, registerAttachment, shareDemand, type ActionState } from "../actions";
import { validateAttachment } from "@/lib/attachments";
import { publicEnv } from "@/lib/env";

const Msg = ({ s }: { s: ActionState }) =>
  s?.message ? <p role="status" className={`mt-2 text-xs ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p> : null;

export function ReassignForm({ demandId, version, ownerId, sellers }: { demandId: string; version: number; ownerId: string | null; sellers: { id: string; name: string }[] }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(reassignDemand, null);
  return (
    <form action={action} className="space-y-2"
      onSubmit={(e) => { if (!confirm("Đổi người phụ trách nhu cầu này?")) e.preventDefault(); }}>
      <input type="hidden" name="demand_id" value={demandId} /><input type="hidden" name="version" value={version} />
      <select name="owner_id" defaultValue={ownerId ?? ""} className="field" aria-label="Người phụ trách mới">
        {sellers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <input name="note" className="field" placeholder="Lý do (không bắt buộc)" />
      <button className="btn btn-ghost w-full" disabled={pending}>Đổi người phụ trách</button>
      <Msg s={s} />
    </form>
  );
}

export function ShareForm({ demandId, candidates }: { demandId: string; candidates: { id: string; name: string }[] }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(shareDemand, null);
  if (candidates.length === 0) return null;
  return (
    <form action={action} className="flex gap-2">
      <input type="hidden" name="demand_id" value={demandId} />
      <select name="user_id" className="field" aria-label="Chia sẻ cho">
        {candidates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <button className="btn btn-ghost shrink-0" disabled={pending}>Chia sẻ</button>
      <Msg s={s} />
    </form>
  );
}

export function UploadForm({ demandId }: { demandId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [s, setS] = useState<ActionState>(null);

  /** Tải thẳng lên Storage bằng URL ký (không đi qua máy chủ ứng dụng), rồi ghi vào hồ sơ nhu cầu. */
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = input.current?.files?.[0];
    if (!file) { setS({ ok: false, message: "Chọn tệp cần tải lên." }); return; }
    const mime = file.type || "";
    const invalid = validateAttachment(mime, file.size);
    if (invalid) { setS({ ok: false, message: invalid }); return; }
    setBusy(true); setS(null);
    const prep = await prepareAttachmentUpload({ demandId, fileName: file.name, mimeType: mime, size: file.size });
    if (!prep.ok) { setBusy(false); setS({ ok: false, message: prep.message }); return; }
    const { url, key } = publicEnv();
    const up = await createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
      .storage.from("demand-files").uploadToSignedUrl(prep.path, prep.token, file, { contentType: mime });
    if (up.error) { setBusy(false); setS({ ok: false, message: "Tải lên không thành công, thử lại." }); return; }
    const reg = await registerAttachment({ demandId, path: prep.path, fileName: file.name, mimeType: mime, size: file.size });
    setBusy(false);
    setS(reg);
    if (reg?.ok) { if (input.current) input.current.value = ""; router.refresh(); }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input ref={input} type="file" name="file" accept="image/*,video/*,application/pdf" className="block w-full text-sm" required disabled={busy} />
      <button className="btn btn-ghost w-full" disabled={busy}>{busy ? "Đang tải lên…" : "Tải tệp lên"}</button>
      <Msg s={s} />
    </form>
  );
}
