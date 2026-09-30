import { StatusTabs } from "@/components/shared/status-tabs";

// Secciones de la página de un producto: sus datos y su receta.
export function ProductTabs({
  companySlug,
  productId,
  active,
}: {
  companySlug: string;
  productId: string;
  active: "datos" | "receta";
}) {
  const base = `/${companySlug}/catalogo/productos/${productId}`;
  return (
    <StatusTabs
      label="Secciones del producto"
      tabs={[
        { href: base, label: "Datos", active: active === "datos" },
        { href: `${base}/receta`, label: "Receta", active: active === "receta" },
      ]}
    />
  );
}
