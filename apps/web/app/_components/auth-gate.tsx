"use client";

import { useEffect, useState, type ReactElement } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "../../src/lib/supabase.js";
import { Dashboard } from "./dashboard.js";

export function AuthGate(): ReactElement {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState(false);

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
  if (session || guest) {
    return (
      <Dashboard
        userId={session?.user.id ?? "guest"}
        email={session?.user.email ?? ""}
        onLoginRequest={() => setGuest(false)}
      />
    );
  }
  return <LoginForm onGuest={() => setGuest(true)} />;
}

function LoginForm({ onGuest }: { onGuest: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "verify">("signin");
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) { setError(error.message); setBusy(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = getSupabase();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) { setError(error.message); } else { setMode("verify"); }
    }
    setBusy(false);
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = getSupabase();
    const { error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: "email" });
    if (error) setError(error.message);
    setBusy(false);
  }

  if (mode === "verify") {
    return (
      <Centered>
        <form onSubmit={verifyOtp} style={{ width: 320, display: "grid", gap: 12 }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>E-posta doğrulama</h1>
          <p style={{ color: "#85786c", margin: 0, fontSize: 13 }}>
            <strong style={{ color: "#efe6dc" }}>{email}</strong> adresine kod gönderildi.
            Maildeki linke tıklayabilir ya da 6 haneli kodu girebilirsin.
          </p>
          <input
            type="text"
            placeholder="6 haneli kod"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            required
            maxLength={6}
            style={{ ...inputStyle, letterSpacing: 6, textAlign: "center", fontSize: 20 }}
          />
          {error && <p style={{ color: "#ef4444", margin: 0, fontSize: 13 }}>{error}</p>}
          <button type="submit" disabled={busy} style={btnStyle}>{busy ? "…" : "Doğrula"}</button>
          <button type="button" onClick={() => { setMode("signup"); setOtpCode(""); setError(null); }} style={ghostBtn}>
            Geri dön
          </button>
        </form>
      </Centered>
    );
  }

  return (
    <Centered>
      <div style={{ width: 320, display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Finance</h1>
        <p style={{ color: "#85786c", margin: 0, fontSize: 13 }}>
          {mode === "signin" ? "Hesabına giriş yap" : "Yeni hesap oluştur"}
        </p>

        <button onClick={signInWithGoogle} disabled={busy} style={{ ...btnStyle, background: "#fff", color: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <GoogleIcon />
          Google ile {mode === "signin" ? "giriş yap" : "kayıt ol"}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <hr style={{ flex: 1, border: "none", borderTop: "1px solid #3f342a" }} />
          <span style={{ color: "#85786c", fontSize: 12 }}>veya</span>
          <hr style={{ flex: 1, border: "none", borderTop: "1px solid #3f342a" }} />
        </div>

        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
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
        </form>

        <button
          type="button"
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
          style={ghostBtn}
        >
          {mode === "signin" ? "Hesabın yok mu? Kayıt ol" : "Zaten hesabın var mı? Giriş yap"}
        </button>

        <button type="button" onClick={onGuest} style={{ ...ghostBtn, color: "#85786c", fontSize: 12 }}>
          Giriş yapmadan devam et →
        </button>
      </div>
    </Centered>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
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

const ghostBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #3f342a",
  background: "transparent",
  color: "#efe6dc",
  fontSize: 13,
  cursor: "pointer",
};
