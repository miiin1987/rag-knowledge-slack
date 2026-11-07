"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Document } from "@/types";

interface DocumentListProps {
  documents: Document[];
  token: string;
  onDeleted: (id: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DocumentList({ documents, token, onDeleted }: DocumentListProps) {
  const [deleting, setDeleting] = useState<string | null>(null);

  if (documents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        登録済み文書はありません
      </p>
    );
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`「${name}」を削除しますか？この操作は元に戻せません。`)) return;

    setDeleting(id);
    try {
      const res = await fetch("/api/admin/documents", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id }),
      });
      if (res.ok) onDeleted(id);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <ul className="space-y-2">
      {documents.map((doc) => (
        <li
          key={doc.id}
          className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm"
        >
          <div className="min-w-0">
            <p className="font-medium truncate">{doc.original_name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDate(doc.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-4">
            <Badge variant="secondary">{doc.page_count}ページ</Badge>
            <Badge variant="outline">{formatBytes(doc.file_size)}</Badge>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={deleting === doc.id}
              onClick={() => handleDelete(doc.id, doc.original_name)}
            >
              {deleting === doc.id ? "削除中…" : "削除"}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
