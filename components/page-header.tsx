import Link from "next/link";

const navLinks = [
  { href: "/", label: "Start" },
  { href: "/plan", label: "Plan" },
  { href: "/drills", label: "Drills" },
  { href: "/kamera", label: "Kamera" },
];

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="space-y-4">
      <nav className="flex gap-1 text-sm">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-md px-2.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
    </header>
  );
}
