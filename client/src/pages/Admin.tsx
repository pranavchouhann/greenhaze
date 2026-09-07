import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Leaf, Lock, Mail, MessageSquare, Save, Server, Settings2, ShieldCheck, Sparkles, Users, Clock, Bot } from "lucide-react";
import { localApi, type ContactMessage } from "@/lib/local-api";

const TOKEN_KEY = "greenhaze-admin-token";

type Tab = "settings" | "contacts" | "users" | "sessions" | "chathistory";

type AdminUser = { id: string; email: string; name: string | null; picture: string | null; role: string; createdAt: string; lastLogin: number | null; messageCount: number };
type AdminSession = { token: string; userId: string; email: string; name: string | null; expiresAt: string };
type ChatMessage = { role: string; text: string; image?: string; timestamp: string };

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
  const [activeTab, setActiveTab] = useState<Tab>("settings");

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

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

  useEffect(() => {
    if (!token || activeTab !== "users") return;
    localApi.adminUsers(token).then(res => setUsers(res.users)).catch(() => {});
  }, [token, activeTab]);

  useEffect(() => {
    if (!token || activeTab !== "sessions") return;
    localApi.adminSessions(token).then(res => setSessions(res.sessions)).catch(() => {});
  }, [token, activeTab]);

  useEffect(() => {
    if (!token || !selectedUserId) { setChatHistory([]); return; }
    setChatLoading(true);
    localApi.adminChatHistory(token, selectedUserId).then(res => { setChatHistory(res.messages); setChatLoading(false); }).catch(() => setChatLoading(false));
  }, [token, selectedUserId]);

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

  function loadChatHistory(userId: string) {
    setSelectedUserId(userId);
    setActiveTab("chathistory");
  }

  if (!token) return <section className="gh-admin"><div className="gh-admin-login"><span><ShieldCheck size={26} /></span><div><p className="gh-kicker">GreenHaze local configuration</p><h1>Restricted access</h1><p>Enter the administrator password from <code>local.config.json</code> to manage the AI connection on this computer.</p></div><form onSubmit={submitLogin}><label>Admin password<div className="gh-password-field"><input required autoFocus type={visible ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} placeholder="Admin password" /><button type="button" onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label><button className="gh-btn gh-btn--primary" disabled={!password}>Unlock admin</button>{loginError && <p className="gh-form-error">{loginError}</p>}</form></div></section>;

  return (
    <section className="gh-admin">
      <div className="gh-wrap">
        <header className="gh-admin-heading">
          <div>
            <span className="gh-kicker"><Settings2 size={14} /> GreenHaze local administration</span>
            <h1>Keep the roots<br /><em>well configured.</em></h1>
            <p>Settings are stored on this computer. The API key is never returned to the browser after saving.</p>
          </div>
          <button className="gh-admin-logout" onClick={() => { sessionStorage.removeItem(TOKEN_KEY); setToken(""); }}>Lock admin</button>
        </header>

        <div className="gh-admin-tabs">
          <button className={activeTab === "settings" ? "active" : ""} onClick={() => setActiveTab("settings")}><Settings2 size={14} /> Settings</button>
          <button className={activeTab === "contacts" ? "active" : ""} onClick={() => setActiveTab("contacts")}><Mail size={14} /> Contacts ({messages.length})</button>
          <button className={activeTab === "users" ? "active" : ""} onClick={() => setActiveTab("users")}><Users size={14} /> Users ({users.length})</button>
          <button className={activeTab === "sessions" ? "active" : ""} onClick={() => setActiveTab("sessions")}><Clock size={14} /> Sessions ({sessions.length})</button>
          <button className={activeTab === "chathistory" ? "active" : ""} onClick={() => setActiveTab("chathistory")}><MessageSquare size={14} /> Chat History</button>
        </div>

        {activeTab === "settings" && (
          <div className="gh-admin-grid">
            <form onSubmit={save} className="gh-admin-card">
              <div className="gh-admin-card-title"><span><Server size={18} /></span><div><strong>AI connection</strong><small>{settings.apiKeyConfigured ? "A local key is configured" : "No key configured yet"}</small></div></div>
              <label>API key <small>Leave blank to keep the current key.</small><div className="gh-input-icon"><KeyRound size={16} /><input type="password" value={form.apiKey} onChange={event => setForm({ ...form, apiKey: event.target.value })} placeholder={settings.apiKeyConfigured ? "Configured locally" : "Paste local API key"} /></div></label>
              <label>OpenAI-compatible API URL<input required value={form.apiUrl} onChange={event => setForm({ ...form, apiUrl: event.target.value })} /></label>
              <label>Vision-capable model<input required value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} /></label>
              <label className="gh-toggle-row"><span><strong>Allow plant scans</strong><small>Pause chat and image analysis without removing settings.</small></span><input type="checkbox" checked={form.allowScans} onChange={event => setForm({ ...form, allowScans: event.target.checked })} /></label>
              <button className="gh-btn gh-btn--primary" disabled={busy}>{busy ? "Saving\u2026" : <><Save size={16} /> Save local settings</>}</button>
              {notice && <p className={notice === "Local settings saved." ? "gh-form-success" : "gh-form-error"}>{notice}</p>}
            </form>
          </div>
        )}

        {activeTab === "contacts" && (
          <div className="gh-admin-grid">
            <div className="gh-admin-card gh-admin-inbox">
              <div className="gh-admin-card-title"><span><Mail size={18} /></span><div><strong>Contact messages</strong><small>{messages.length} message{messages.length !== 1 ? "s" : ""}</small></div></div>
              {messages.length === 0 && <p className="gh-admin-empty">No messages yet.</p>}
              {messages.map(msg => (
                <div key={msg.id} className="gh-admin-msg">
                  <div className="gh-admin-msg-head"><strong>{msg.name}</strong><small>{msg.email}</small><small>{new Date(msg.createdAt).toLocaleDateString()}</small></div>
                  <p>{msg.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "users" && (
          <div className="gh-admin-grid">
            <div className="gh-admin-card">
              <div className="gh-admin-card-title"><span><Users size={18} /></span><div><strong>All users</strong><small>{users.length} registered user{users.length !== 1 ? "s" : ""}</small></div></div>
              {users.length === 0 && <p className="gh-admin-empty">No users yet.</p>}
              {users.length > 0 && (
                <div className="gh-admin-table-wrap">
                  <table className="gh-admin-table">
                    <thead>
                      <tr><th>User</th><th>Email</th><th>Role</th><th>Joined</th><th>Last Login</th><th>Messages</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id}>
                          <td><div className="gh-admin-user-cell">{u.picture ? <img src={u.picture} alt="" className="gh-admin-avatar" /> : <span className="gh-admin-avatar gh-admin-avatar--icon"><Leaf size={14} /></span>}<span>{u.name || "—"}</span></div></td>
                          <td><small>{u.email}</small></td>
                          <td><span className={`gh-badge gh-badge--${u.role}`}>{u.role}</span></td>
                          <td><small>{new Date(u.createdAt).toLocaleDateString()}</small></td>
                          <td><small>{u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : "Never"}</small></td>
                          <td><strong>{u.messageCount}</strong></td>
                          <td><button className="gh-btn gh-btn--ghost" onClick={() => loadChatHistory(u.id)} title="View chat history"><MessageSquare size={14} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "sessions" && (
          <div className="gh-admin-grid">
            <div className="gh-admin-card">
              <div className="gh-admin-card-title"><span><Clock size={18} /></span><div><strong>Active sessions</strong><small>{sessions.length} active session{sessions.length !== 1 ? "s" : ""}</small></div></div>
              {sessions.length === 0 && <p className="gh-admin-empty">No active sessions.</p>}
              {sessions.length > 0 && (
                <div className="gh-admin-table-wrap">
                  <table className="gh-admin-table">
                    <thead>
                      <tr><th>User</th><th>Email</th><th>Session Token</th><th>Expires</th></tr>
                    </thead>
                    <tbody>
                      {sessions.map(s => (
                        <tr key={s.token}>
                          <td><div className="gh-admin-user-cell"><span>{s.name || "—"}</span></div></td>
                          <td><small>{s.email}</small></td>
                          <td><code className="gh-admin-token">{s.token.slice(0, 8)}...{s.token.slice(-4)}</code></td>
                          <td><small>{new Date(s.expiresAt).toLocaleString()}</small></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "chathistory" && (
          <div className="gh-admin-grid">
            <div className="gh-admin-card">
              <div className="gh-admin-card-title"><span><Bot size={18} /></span><div><strong>Chat History</strong><small>Select a user to view their conversation</small></div></div>
              <label className="gh-admin-chat-select">Select user
                <select value={selectedUserId} onChange={event => setSelectedUserId(event.target.value)}>
                  <option value="">Choose a user...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email} ({u.messageCount} messages)</option>)}
                </select>
              </label>
              {selectedUserId && chatLoading && <p className="gh-admin-empty">Loading chat history...</p>}
              {selectedUserId && !chatLoading && chatHistory.length === 0 && <p className="gh-admin-empty">No messages for this user yet.</p>}
              {selectedUserId && !chatLoading && chatHistory.length > 0 && (
                <div className="gh-admin-chat-history">
                  {chatHistory.map((msg, index) => (
                    <div key={index} className={`gh-admin-chat-msg gh-admin-chat-msg--${msg.role}`}>
                      <div className="gh-admin-chat-msg-head">
                        <span className="gh-admin-chat-role">{msg.role === "user" ? "User" : "GreenHaze"}</span>
                        <small>{new Date(msg.timestamp).toLocaleString()}</small>
                      </div>
                      {msg.image && <img src={msg.image} alt="Shared image" className="gh-admin-chat-image" />}
                      <p>{msg.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
