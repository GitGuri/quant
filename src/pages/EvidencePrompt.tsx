// EvidencePrompt.tsx (or inline in the same file)
import React, { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload } from "lucide-react";

export function EvidencePrompt({
  open,
  onClose,
  apiBaseUrl = "https://quantnow-cu1v.onrender.com",
  token,
  defaultNotes,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  apiBaseUrl?: string;
  token: string | null;
  defaultNotes?: string;
  onUploaded?: (ok: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState(defaultNotes || "");
  const [busy, setBusy] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    if (!token) {
      alert("You must be logged in to upload documents.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("document", file);
      // Optional extras if your backend accepts them; safe to include:
      fd.append("notes", notes || "");
      fd.append("type", "financial");

      const res = await fetch(`${apiBaseUrl}/upload-document`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      onUploaded?.(true);
      onClose();
    } catch (err: any) {
      console.error("Evidence upload failed:", err);
      alert(`Upload failed: ${err?.message || err}`);
      onUploaded?.(false);
    } finally {
      setBusy(false);
      setFile(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload supporting evidence</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="mb-1 block">File</Label>
            <Input
              type="file"
              ref={fileRef}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              accept=".pdf,.png,.jpg,.jpeg"
            />
            <div className="text-xs text-gray-500 mt-1">PDF or image files are ideal.</div>
          </div>

          <div>
            <Label className="mb-1 block">Notes (optional)</Label>
            <Input
              placeholder="Brief description e.g. ‘till slip for groceries 2025-07-05’"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={handleUpload} disabled={!file || busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
