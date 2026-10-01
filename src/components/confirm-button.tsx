"use client";

/** Nút gửi form có hộp xác nhận cho thao tác quan trọng. */
export function ConfirmButton({ message, className, children, disabled }: { message: string; className?: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button className={className} disabled={disabled} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
