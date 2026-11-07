"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UploadResult {
  id: string;
  original_name: string;
  page_count: number;
  chunk_count: number;
}

interface UploadFormProps {
  token: string;
  onUploaded: () => void;
}

export function UploadForm({ token, onUploaded }: UploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setStatus("uploading");
    setMessage("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "アップロードに失敗しました");
        return;
      }

      setStatus("success");
      setResult(data.document);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      onUploaded();
    } catch {
      setStatus("error");
      setMessage("ネットワークエラーが発生しました");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="pdf-upload">PDFファイル</Label>
        <Input
          id="pdf-upload"
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setStatus("idle");
            setMessage("");
            setResult(null);
          }}
          disabled={status === "uploading"}
        />
        <p className="text-xs text-muted-foreground">
          上限: 10MB / 50ページ
        </p>
      </div>

      <Button
        type="submit"
        disabled={!file || status === "uploading"}
        className="w-full"
      >
        {status === "uploading" ? "処理中…" : "アップロード＆インデックス作成"}
      </Button>

      {status === "error" && (
        <p className="text-sm text-destructive">{message}</p>
      )}

      {status === "success" && result && (
        <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-3 text-sm">
          <p className="font-medium text-green-800 dark:text-green-400">
            アップロード完了
          </p>
          <p className="text-green-700 dark:text-green-500 mt-1">
            {result.original_name} — {result.page_count}ページ / {result.chunk_count}チャンク
          </p>
        </div>
      )}
    </form>
  );
}
