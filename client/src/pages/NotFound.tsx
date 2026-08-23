import { AlertTriangle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <section className="gh-scan-page" style={{ display: "grid", placeItems: "center" }}>
      <div className="gh-chat-wrap" style={{ textAlign: "center", maxWidth: 480 }}>
        <div style={{ marginBottom: 24 }}>
          <AlertTriangle size={48} style={{ color: "#c0764a" }} />
        </div>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 72, color: "var(--deep)", margin: 0 }}>404</h1>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 28, color: "var(--deep)", margin: "8px 0 0" }}>Page Not Found</h2>
        <p style={{ color: "var(--soft)", fontSize: 13, lineHeight: 1.7, marginTop: 16 }}>
          The page you're looking for doesn't exist. It may have been moved or deleted.
        </p>
        <button className="gh-btn gh-btn--primary" onClick={() => setLocation("/")} style={{ marginTop: 28 }}>
          <Home size={16} /> Go Home
        </button>
      </div>
    </section>
  );
}
