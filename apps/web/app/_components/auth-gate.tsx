"use client";

import { useEffect, useState, type ReactElement } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "../../src/lib/supabase.js";
import { Dashboard } from "./dashboard.js";

export function AuthGate(): ReactElement {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) return <Centered>Yükleniyor…</Centered>;
  if (!session) return <LoginForm />;
  return <Dashboard userId={session.user.id} email={session.user.email ?? ""} />;
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = getSupabase();
    const fn =
      mode === "signin"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });
    const { error } = await fn;
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <Centered>
      <form onSubmit={submit} style={{ width: 320, display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Finance</h1>
        <p style={{ color: "#85786c", margin: 0, fontSize: 13 }}>
          {mode === "signin" ? "Giriş yap" : "Hesap oluştur"}
        </p>
        <input
          type="email"
          placeholder="E-posta"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Şifre (min 6 karakter)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          style={inputStyle}
        />
        {error && <p style={{ color: "#ef4444", margin: 0, fontSize: 13 }}>{error}</p>}
        <button type="submit" disabled={busy} style={btnStyle}>
          {busy ? "…" : mode === "signin" ? "Giriş yap" : "Kayıt ol"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          style={{ ...btnStyle, background: "transparent", color: "#85786c" }}
        >
          {mode === "signin" ? "Hesabın yok mu? Kayıt ol" : "Zaten hesabın var mı? Giriş yap"}
        </button>
      </form>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      {children}
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #3f342a",
  background: "#221a15",
  color: "#efe6dc",
  fontSize: 14,
};

const btnStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #3f342a",
  background: "#c8814e",
  color: "white",
  fontSize: 14,
  cursor: "pointer",
};
