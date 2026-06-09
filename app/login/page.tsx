"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../supabase";

export default function LoginPage() {
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const bg = dark ? "#0D0D0D" : "#F7F4EF";
  const cardBg = dark ? "#161616" : "#FFFFFF";
  const border = dark ? "#252525" : "#E5DDD0";
  const text = dark ? "#EDE8E0" : "#1C1510";
  const textSub = "#7A6A58";
  const accent = "#8B6F47";
  const inp = { width: "100%", padding: "11px 14px", background: dark ? "#1E1E1E" : "#FDFAF6", border: `1px solid ${border}`, color: text, fontFamily: "Jost,sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box" as const };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(lang === "ar" ? "البريد الإلكتروني أو كلمة المرور غير صحيحة" : "Invalid email or password");
      return;
    }
    router.replace("/");
    router.refresh();
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetLoading(false);
    if (error) { setError(error.message); return; }
    setResetSent(true);
  };

  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Jost,sans-serif", direction: lang === "ar" ? "rtl" : "ltr" }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <div style={{ position: "fixed", top: 20, right: 20, display: "flex", gap: 8 }}>
        <button onClick={() => setLang(l => l === "en" ? "ar" : "en")} style={{ background: "transparent", border: `1px solid ${border}`, color: textSub, padding: "6px 16px", fontSize: 11, letterSpacing: 1, cursor: "pointer", fontFamily: "Jost,sans-serif" }}>{lang === "en" ? "العربية" : "English"}</button>
        <button onClick={() => setDark(d => !d)} style={{ background: "transparent", border: `1px solid ${border}`, color: textSub, padding: "6px 12px", fontSize: 14, cursor: "pointer" }}>{<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="5"/><path d="M12 7V5M12 19v-2M7 12H5M19 12h-2M8.5 8.5 7 7M17 17l-1.5-1.5M8.5 15.5 7 17M17 7l-1.5 1.5"/><path d="M12 7a5 5 0 0 1 0 10V7z" fill="currentColor" stroke="none"/></svg>}</button>
      </div>
      {!forgot ? (
      <form onSubmit={handleLogin} style={{ background: cardBg, border: `1px solid ${border}`, padding: "52px 44px", width: 380, textAlign: "center" }}>
        <p style={{ fontSize: 10, letterSpacing: 4, textTransform: "uppercase", color: accent, marginBottom: 10 }}>{lang === "ar" ? "بوابة الإدارة" : "Admin Portal"}</p>
        <h1 style={{ fontFamily: "Cormorant Garamond,serif", fontSize: 34, fontWeight: 300, color: text, marginBottom: 6, letterSpacing: 2 }}>JOUD ALOUD</h1>
        <p style={{ fontSize: 12, color: textSub, marginBottom: 32 }}>{lang === "ar" ? "سجّل دخولك" : "Sign in to manage your store"}</p>
        <input type="email" required value={email} onChange={e => { setEmail(e.target.value); setError(""); }} placeholder={lang === "ar" ? "البريد الإلكتروني" : "Email"} style={{ ...inp, marginBottom: 12 }} />
        <input type="password" required value={password} onChange={e => { setPassword(e.target.value); setError(""); }} placeholder={lang === "ar" ? "كلمة المرور" : "Password"} style={{ ...inp, marginBottom: error ? 0 : 18 }} />
        {error && <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C", padding: "10px 14px", fontSize: 12, marginTop: 10, marginBottom: 14, textAlign: lang === "ar" ? "right" : "left" }}>⚠️ {error}</div>}
        <button type="submit" disabled={loading} style={{ width: "100%", background: dark ? "#E8DFD0" : "#1C1510", color: dark ? "#1C1510" : "#E8DFD0", border: "none", padding: 15, fontSize: 11, letterSpacing: 3, textTransform: "uppercase", cursor: "pointer", fontFamily: "Jost,sans-serif", marginTop: 4, opacity: loading ? 0.6 : 1 }}>
          {loading ? (lang === "ar" ? "جارِ الدخول…" : "Signing in…") : (lang === "ar" ? "دخول" : "Sign In")}
        </button>
        <button type="button" onClick={() => { setForgot(true); setError(""); setResetSent(false); }} style={{ background: "none", border: "none", color: textSub, fontSize: 12, marginTop: 16, cursor: "pointer", fontFamily: "Jost,sans-serif", textDecoration: "underline" }}>
          {lang === "ar" ? "نسيت كلمة المرور؟" : "Forgot password?"}
        </button>
      </form>
      ) : (
      <form onSubmit={handleReset} style={{ background: cardBg, border: `1px solid ${border}`, padding: "52px 44px", width: 380, textAlign: "center" }}>
        <p style={{ fontSize: 10, letterSpacing: 4, textTransform: "uppercase", color: accent, marginBottom: 10 }}>{lang === "ar" ? "إعادة تعيين كلمة المرور" : "Reset Password"}</p>
        <h1 style={{ fontFamily: "Cormorant Garamond,serif", fontSize: 34, fontWeight: 300, color: text, marginBottom: 6, letterSpacing: 2 }}>JOUD ALOUD</h1>
        {!resetSent ? (
        <>
          <p style={{ fontSize: 12, color: textSub, marginBottom: 32 }}>{lang === "ar" ? "أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين" : "Enter your email and we'll send you a reset link"}</p>
          <input type="email" required value={email} onChange={e => { setEmail(e.target.value); setError(""); }} placeholder={lang === "ar" ? "البريد الإلكتروني" : "Email"} style={{ ...inp, marginBottom: error ? 0 : 18 }} />
          {error && <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C", padding: "10px 14px", fontSize: 12, marginTop: 10, marginBottom: 14, textAlign: lang === "ar" ? "right" : "left" }}>⚠️ {error}</div>}
          <button type="submit" disabled={resetLoading} style={{ width: "100%", background: dark ? "#E8DFD0" : "#1C1510", color: dark ? "#1C1510" : "#E8DFD0", border: "none", padding: 15, fontSize: 11, letterSpacing: 3, textTransform: "uppercase", cursor: "pointer", fontFamily: "Jost,sans-serif", marginTop: 4, opacity: resetLoading ? 0.6 : 1 }}>
            {resetLoading ? (lang === "ar" ? "جارِ الإرسال…" : "Sending…") : (lang === "ar" ? "إرسال رابط إعادة التعيين" : "Send Reset Link")}
          </button>
        </>
        ) : (
          <p style={{ fontSize: 13, color: text, marginBottom: 24, lineHeight: 1.6 }}>{lang === "ar" ? "تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني. تحقق من صندوق الوارد." : "A reset link has been sent to your email. Check your inbox."}</p>
        )}
        <button type="button" onClick={() => { setForgot(false); setError(""); setResetSent(false); }} style={{ background: "none", border: "none", color: textSub, fontSize: 12, marginTop: 16, cursor: "pointer", fontFamily: "Jost,sans-serif", textDecoration: "underline" }}>
          {lang === "ar" ? "العودة لتسجيل الدخول" : "Back to sign in"}
        </button>
      </form>
      )}
    </div>
  );
}
