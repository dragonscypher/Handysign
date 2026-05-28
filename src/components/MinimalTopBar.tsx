"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/live", label: "Live" },
  { href: "/verify", label: "Verify" },
  { href: "/teach", label: "Teach" },
  { href: "/minimal-pair", label: "Minimal Pair Lab" },
  { href: "/evidence-health", label: "Evidence Health" },
  { href: "/memory", label: "Memory" },
] as const;

export default function MinimalTopBar() {
  const pathname = usePathname();

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <Link href="/" className="brand-mark">
          SignRepair
        </Link>
        <p className="brand-caption">Privacy-first sign evidence and repair prototype.</p>
      </div>
      <nav className="site-nav" aria-label="Primary">
        {NAV_LINKS.map((link) => {
          const active = pathname === link.href;

          return (
            <Link
              key={link.href}
              href={link.href}
              className={active ? "nav-link is-active" : "nav-link"}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
