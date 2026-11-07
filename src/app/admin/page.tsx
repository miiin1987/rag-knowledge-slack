"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { UploadForm } from "@/components/admin/UploadForm";
import { DocumentList } from "@/components/admin/DocumentList";
import type { Document } from "@/types";

const TOKEN_KEY = "rag_admin_token";

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  // セッションストレージからトークンを復元
  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
  }, []);

  const fetchDocuments = useCallback(async (t: string) => {
    setDocsLoading(true);
    try {
      const res = await fetch("/api/admin/documents", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents ?? []);
      } else if (res.status === 401) {
        // トークン無効 → ログアウト
        sessionStorage.removeItem(TOKEN_KEY);
        setToken(null);
      }
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) fetchDocuments(token);
  }, [token, fetchDocuments]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    setAuthLoading(false);

    if (!res.ok) {
      setAuthError("パスワードが正しくありません");
      return;
    }

    const { token: newToken } = await res.json();
    sessionStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setPassword("");
  }

  function handleLogout() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setDocuments([]);
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h1 className="text-xl font-semibold">管理者ログイン</h1>
            <p className="text-sm text-muted-foreground mt-1">
              PDFのアップロードには管理者パスワードが必要です
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-password">パスワード</Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="管理者パスワード"
                autoComplete="current-password"
              />
            </div>
            {authError && (
              <p className="text-sm text-destructive">{authError}</p>
            )}
            <Button type="submit" className="w-full" disabled={authLoading || !password}>
              {authLoading ? "確認中…" : "ログイン"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold">管理画面</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            PDFをアップロードして検索インデックスを作成します
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 h-8 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            チャット画面へ
          </a>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            ログアウト
          </Button>
        </div>
      </div>

      <section className="space-y-4 mb-8">
        <h2 className="font-medium">PDFアップロード</h2>
        <UploadForm
          token={token}
          onUploaded={() => fetchDocuments(token)}
        />
      </section>

      <Separator className="my-6" />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">登録済み文書</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchDocuments(token)}
            disabled={docsLoading}
          >
            {docsLoading ? "読み込み中…" : "更新"}
          </Button>
        </div>
        <DocumentList
          documents={documents}
          token={token}
          onDeleted={(id) => setDocuments((prev) => prev.filter((d) => d.id !== id))}
        />
      </section>
    </div>
  );
}
