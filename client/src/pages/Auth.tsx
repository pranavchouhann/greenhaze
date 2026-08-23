import { FormEvent, useState } from "react";
import { Link, useLocation } from "wouter";
import { localApi } from "@/lib/local-api";

export default function Auth() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try { if (mode === "login") await localApi.login(email, password); else await localApi.register(email, password); setLocation("/schedule"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Authentication failed."); }
    finally { setBusy(false); }
  }
  return <section className="gh-admin"><div className="gh-admin-login"><span className="gh-brand-mark">GH</span><div><p className="gh-kicker">GreenHaze account</p><h1>{mode === "login" ? "Return to your rhythm." : "Create your care rhythm."}</h1><p>Use an email and password to keep your private watering reminders across devices.</p></div><form onSubmit={submit}><label>Email<input required type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label><label>Password<input required minLength={8} type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 8 characters" /></label><button className="gh-btn gh-btn--primary" disabled={busy}>{busy ? "Working..." : mode === "login" ? "Sign in" : "Create account"}</button>{error && <p className="gh-form-error">{error}</p>}</form>{mode === "login" && <p style={{ fontSize: 11, color: "var(--soft)", marginTop: 8, textAlign: "center" }}>Forgot your password? Ask the admin at <code>/admin</code> to reset it.</p>}<button className="gh-text-button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Need an account? Create one" : "Already have an account? Sign in"}</button><Link href="/" className="gh-text-button">Return home</Link></div></section>;
}
