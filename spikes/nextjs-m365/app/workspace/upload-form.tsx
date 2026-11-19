"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function UploadForm({ folderId }: { folderId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<string>("");

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus(`Uploading ${file.name}...`);
    const params = new URLSearchParams({ folderId, name: file.name });
    // A File body is sent with an exact Content-Length and is not buffered by a Server Action.
    const response = await fetch(`/api/upload?${params}`, { method: "PUT", body: file, headers: { "x-requested-with": "fetch" } });
    if (response.ok) {
      setStatus("Uploaded.");
      router.refresh();
    } else {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus(`Upload failed: ${body.error ?? response.status}`);
    }
    event.target.value = "";
  }

  return (
    <p>
      <input type="file" onChange={onChange} /> <span role="status">{status}</span>
    </p>
  );
}
