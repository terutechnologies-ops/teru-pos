import Link from "next/link";

// Pestañas de una lista (Activos / Archivados) como enlaces: el estado
// queda en la dirección y funcionan sin JS.
export function StatusTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: { href: string; label: string; active: boolean }[];
}) {
  return (
    <nav aria-label={label} className="flex gap-2 text-sm font-semibold">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={
            tab.active
              ? "rounded-full bg-primary px-4 py-1.5 text-primary-foreground"
              : "rounded-full bg-muted px-4 py-1.5 text-muted-foreground hover:text-foreground"
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
