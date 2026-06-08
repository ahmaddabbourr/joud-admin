"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);

  const bg = dark ? "#0D0D0D" : "#F7F4EF";
  const cardBg = dark ? "#161616" : "#FFFFFF";
  const border = dark ? "#252525" : "#E5DDD0";
  const text = dark ? "#EDE8E0" : "#1C1510";
  const textSub = "#7A6A58";
  const accent = "#8B6F47";
  const inp = { width: "100%", padding: "11px 14px", background: dark ? "#1E1E1E" : "#FDFAF6", border: `1px solid ${border}`, color: text, fontFamily: "Jost,sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box" as const };

  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session?.user) setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => { if (session?.user) setReady(true); });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError(lang === "ar" ? "كلمة المرور يجب أن تكون 6 أحرف على الأقل" : "Password must be at least 6 characters"); return; }
    if (password !== confirmPassword) { setError(lang === "ar" ? "كلمتا المرور غير متطابقتين" : "Passwords don't match"); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    setTimeout(() => { router.replace("/login"); }, 2000);
  };

  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Jost,sans-serif", direction: lang === "ar" ? "rtl" : "ltr" }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <div style={{ position: "fixed", top: 20, right: 20, display: "flex", gap: 8 }}>
        <button onClick={() => setLang(l => l === "en" ? "ar" : "en")} style={{ background: "transparent", border: `1px solid ${border}`, color: textSub, padding: "6px 16px", fontSize: 11, letterSpacing: 1, cursor: "pointer", fontFamily: "Jost,sans-serif" }}>{lang === "en" ? "العربية" : "English"}</button>
        <button onClick={() => setDark(d => !d)} style={{ background: "transparent", border: `1px solid ${border}`, color: textSub, padding: "6px 12px", fontSize: 14, cursor: "pointer" }}>{dark ? "☀️" : "🌙"}</button>
      </div>
      <form onSubmit={handleSubmit} style={{ background: cardBg, border: `1px solid ${border}`, padding: "52px 44px", width: 380, textAlign: "center" }}>
        <p style={{ fontSize: 10, letterSpacing: 4, textTransform: "uppercase", color: accent, marginBottom: 10 }}>{lang === "ar" ? "بوابة الإدارة" : "Admin Portal"}</p>
        <h1 style={{ fontFamily: "Cormorant Garamond,serif", fontSize: 34, fontWeight: 300, color: text, marginBottom: 6, letterSpacing: 2 }}>JOUD ALOUD</h1>
        {done ? (
          <p style={{ fontSize: 13, color: text, marginTop: 20, lineHeight: 1.6 }}>{lang === "ar" ? "تم تغيير كلمة المرور بنجاح. جارِ التحويل لتسجيل الدخول…" : "Password changed successfully. Redirecting to sign in…"}</p>
        ) : !ready ? (
          <p style={{ fontSize: 13, color: textSub, marginTop: 20, lineHeight: 1.6 }}>{lang === "ar" ? "جارِ التحقق من رابط إعادة التعيين…" : "Verifying reset link…"}</p>
        ) : (
        <>
          <p style={{ fontSize: 12, color: textSub, marginBottom: 32 }}>{lang === "ar" ? "أدخل كلمة المرور الجديدة" : "Enter your new password"}</p>
          <input type="password" required value={password} onChange={e => { setPassword(e.target.value); setError(""); }} placeholder={lang === "ar" ? "كلمة المرور الجديدة" : "New password"} style={{ ...inp, marginBottom: 12 }} />
          <input type="password" required value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setError(""); }} placeholder={lang === "ar" ? "تأكيد كلمة المرور" : "Confirm password"} style={{ ...inp, marginBottom: error ? 0 : 18 }} />
          {error && <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C", padding: "10px 14px", fontSize: 12, marginTop: 10, marginBottom: 14, textAlign: lang === "ar" ? "right" : "left" }}>⚠️ {error}</div>}
          <button type="submit" disabled={loading} style={{ width: "100%", background: dark ? "#E8DFD0" : "#1C1510", color: dark ? "#1C1510" : "#E8DFD0", border: "none", padding: 15, fontSize: 11, letterSpacing: 3, textTransform: "uppercase", cursor: "pointer", fontFamily: "Jost,sans-serif", marginTop: 4, opacity: loading ? 0.6 : 1 }}>
            {loading ? (lang === "ar" ? "جارِ الحفظ…" : "Saving…") : (lang === "ar" ? "تغيير كلمة المرور" : "Change Password")}
          </button>
        </>
        )}
      </form>
    </div>
  );
}
