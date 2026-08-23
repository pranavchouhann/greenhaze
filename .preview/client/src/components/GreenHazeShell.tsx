import { Leaf, Menu, Moon, ScanSearch, Sun, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

const navItems = [
  { label: "How it works", target: "how-it-works" },
  { label: "Features", target: "features" },
  { label: "About", target: "about" },
];

function useSectionNavigation() {
  const [location, setLocation] = useLocation();
  return (target: string) => {
    if (location !== "/") {
      setLocation(`/#${target}`);
      return;
    }
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
}

function useThemeToggle() {
  const [dark, setDark] = useState(() => localStorage.getItem("gh-theme") === "dark");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    localStorage.setItem("gh-theme", dark ? "dark" : "light");
  }, [dark]);
  const toggle = useCallback(() => setDark(d => !d), []);
  return { dark, toggle };
}

export function GreenHazeShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const jump = useSectionNavigation();
  const { dark, toggle: toggleTheme } = useThemeToggle();

  return (
    <div className="gh-app-shell">
      <a href="#main-content" className="gh-skip-link">Skip to main content</a>
      <header className="gh-header">
        <div className="gh-nav">
          <Link href="/" className="gh-brand" aria-label="GreenHaze home">
            <span className="gh-brand-mark"><Leaf size={16} /></span>
            <span>GREEN<span>HAZE</span></span>
          </Link>
          <nav className="gh-nav-links" aria-label="Primary navigation">
            {navItems.map((item) => <button key={item.target} onClick={() => jump(item.target)}>{item.label}</button>)}
            <Link href="/schedule">Watering</Link>
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="gh-theme-toggle" onClick={toggleTheme} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}>
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <Link href="/scan" className="gh-nav-scan"><ScanSearch size={15} /> Scan your plant</Link>
          </div>
          <button className="gh-mobile-menu" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
        {open && <nav className="gh-mobile-nav" aria-label="Mobile navigation">
          {navItems.map((item) => <button key={item.target} onClick={() => { setOpen(false); jump(item.target); }}>{item.label}</button>)}
          <Link href="/schedule" onClick={() => setOpen(false)}>Watering schedule</Link>
          <Link href="/scan" onClick={() => setOpen(false)}>Scan your plant</Link>
          <button onClick={() => { toggleTheme(); setOpen(false); }}>{dark ? "Light mode" : "Dark mode"}</button>
        </nav>}
      </header>
      <main id="main-content">{children}</main>
      <footer className="gh-footer">
        <div className="gh-footer-inner">
          <div><div className="gh-brand gh-brand--footer"><span className="gh-brand-mark"><Leaf size={16} /></span><span>GREEN<span>HAZE</span></span></div><p>Gentler, smarter care for every leaf in your space.</p></div>
          <div className="gh-footer-links"><Link href="/schedule">Watering</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/admin">Admin</Link></div>
        </div>
        <div className="gh-footer-bottom"><span>© {new Date().getFullYear()} GreenHaze</span><span>AI guidance is informational—not a professional diagnosis.</span></div>
      </footer>
    </div>
  );
}

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="gh-legal"><span className="gh-kicker">GreenHaze policy</span><h1>{title}</h1><article>{children}</article></section>;
}
