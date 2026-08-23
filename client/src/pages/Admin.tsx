import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Leaf, Lock, Mail, Save, Server, Settings2, ShieldCheck, Sparkles } from "lucide-react";
import { localApi, type ContactMessage } from "@/lib/local-api";

const TOKEN_KEY = "greenhaze-admin-token";

export default function Admin() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || "");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [notice, setNotice] = useState("");
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [settings, setSettings] = useState({ apiKeyConfigured: false, apiUrl: "", model: "", allowScans: true, adminPasswordConfigured: false });
  const [form, setForm] = useState({ apiKey: "", apiUrl: "", model: "", allowScans: true });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    void Promise.all([localApi.adminSettings(token), localApi.contacts(token)])
      .then(([nextSettings, inbox]) => {
        setSettings(nextSettings);
        setForm(current => ({ ...current, apiUrl: nextSettings.apiUrl, model: nextSettings.model, allowScans: nextSettings.allowScans }));
        setMessages(inbox.messages);
      })
      .catch(() => { sessionStorage.removeItem(TOKEN_KEY); setToken(""); });
  }, [token]);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoginError("");
    try { const response = await localApi.adminLogin(password); sessionStorage.setItem(TOKEN_KEY, response.token); setToken(response.token); setPassword(""); }
    catch (reason) { setLoginError(reason instanceof Error ? reason.message : "That password did not unlock GreenHaze administration."); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const next = await localApi.saveAdminSettings(token, { ...(form.apiKey ? { apiKey: form.apiKey } : {}), apiUrl: form.apiUrl, model: form.model, allowScans: form.allowScans });
      setSettings(current => ({ ...current, apiUrl: next.apiUrl, model: next.model, allowScans: next.allowScans, apiKeyConfigured: current.apiKeyConfigured || Boolean(form.apiKey) }));
      setForm(current => ({ ...current, apiKey: "" })); setNotice("Local settings saved.");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Settings could not be saved."); }
    finally { setBusy(false); }
  }

  if (!token) return <section className="gh-admin"><div className="gh-admin-login"><span><ShieldCheck size={26} /></span><div><p className="gh-kicker">GreenHaze local configuration</p><h1>Restricted access</h1><p>Enter the administrator password from <code>local.config.json</code> to manage the AI connection on this computer.</p></div><form onSubmit={submitLogin}><label>Admin password<div className="gh-password-field"><input required autoFocus type={visible ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} placeholder="Admin password" /><button type="button" onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label><button className="gh-btn gh-btn--primary" disabled={!password}>Unlock admin</button>{loginError && <p className="gh-form-error">{loginError}</p>}</form></div></section>;

  return <section className="gh-admin"><div className="gh-wrap"><header className="gh-admin-heading"><div><span className="gh-kicker"><Settings2 size={14} /> GreenHaze local administration</span><h1>Keep the roots<br /><em>well configured.</em></h1><p>Settings are stored on this computer. The API key is never returned to the browser after saving.</p></div><button className="gh-admin-logout" onClick={() => { sessionStorage.removeItem(TOKEN_KEY); setToken(""); }}>Lock admin</button></header><div className="gh-admin-grid"><form onSubmit={save} className="gh-admin-card"><div className="gh-admin-card-title"><span><Server size={18} /></span><div><strong>AI connection</strong><small>{settings.apiKeyConfigured ? "A local key is configured" : "No key configured yet"}</small></div></div><label>API key <small>Leave blank to keep the current key.</small><div className="gh-input-icon"><KeyRound size={16} /><input type="password" value={form.apiKey} onChange={event => setForm({ ...form, apiKey: event.target.value })} placeholder={settings.apiKeyConfigured ? "Configured locally" : "Paste local API key"} /></div></label><label>OpenAI-compatible API URL<input required value={form.apiUrl} onChange={event => setForm({ ...form, apiUrl: event.target.value })} /></label><label>Vision-capable model<input required value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} /></label><label className="gh-toggle-row"><span><strong>Allow plant scans</strong><small>Pause chat and image analysis without removing settings.</small></span><input type="checkbox" checked={form.allowScans} onChange={event => setForm({ ...form, allowScans: event.target.checked })} /></label><button className="gh-btn gh-btn--primary" disabled={busy}>{busy ? "Saving…" : <><Save size={16} /> Save local settings</>}</button>{notice && <p className={notice === "Local settings saved." ? "gh-form-success" : "gh-form-error"}>{notice}</p>}</form><aside className="gh-admin-card gh-admin-inbox"><div className="gh-admin-card-title"><span><Mail size={18} /></span><div><strong>Contact inbox</strong><small>{messages.length} recent messages</small></div></div>{messages.length ? <div className="gh-message-list">{messages.map(item => <article key={item.id}><div><strong>{item.name}</strong><small>{item.email}</small></div><time>{new Date(item.createdAt).toLocaleDateString()}</time><p>{item.message}</p></article>)}</div> : <div className="gh-empty-inbox"><Leaf size={28} /><p>Your contact inbox is quiet for now.</p></div>}<div className="gh-admin-status"><span><Sparkles size={16} /> AI key {settings.apiKeyConfigured ? "configured" : "needed"}</span><span><Lock size={16} /> Local password {settings.adminPasswordConfigured ? "active" : "needs setup"}</span></div></aside></div></div></section>;
}
