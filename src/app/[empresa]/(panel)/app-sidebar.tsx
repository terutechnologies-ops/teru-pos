"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Store } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

import { logoutAction } from "./actions";
import {
  NAV_GROUP_LABELS,
  NAV_ITEMS,
  navHref,
  type NavGroup,
} from "./navigation";

// Menú lateral. Recibe del servidor qué secciones puede ver esta persona;
// aquí solo se dibujan.
export function AppSidebar({
  companySlug,
  companyName,
  userName,
  roleLabel,
  itemIds,
}: {
  companySlug: string;
  companyName: string;
  userName: string;
  roleLabel: string;
  itemIds: readonly string[];
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => itemIds.includes(item.id));
  const groups = [...new Set(items.map((item) => item.group))] as NavGroup[];

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-highlight text-highlight-foreground">
            <Store className="size-5" aria-hidden />
          </span>
          <span className="truncate text-base leading-6 font-bold tracking-tight">
            {companyName}
          </span>
        </div>
      </SidebarHeader>
      <SidebarSeparator className="mx-0" />

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group}>
            <SidebarGroupLabel className="text-brand-muted-foreground">
              {NAV_GROUP_LABELS[group]}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items
                  .filter((item) => item.group === group)
                  .map((item) => {
                    const href = navHref(companySlug, item);
                    const active =
                      pathname === href ||
                      (item.path !== "" && pathname.startsWith(`${href}/`));
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          className="h-10 data-active:bg-sidebar-primary data-active:font-semibold data-active:text-sidebar-primary-foreground"
                        >
                          <Link href={href} aria-current={active ? "page" : undefined}>
                            <Icon aria-hidden />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarSeparator className="mx-0" />
      <SidebarFooter className="gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{userName}</p>
          <p className="text-xs text-brand-muted-foreground">{roleLabel}</p>
        </div>
        <form action={logoutAction.bind(null, companySlug)}>
          <SidebarMenuButton type="submit" className="h-9">
            <LogOut aria-hidden />
            <span>Cerrar sesión</span>
          </SidebarMenuButton>
        </form>
      </SidebarFooter>
    </Sidebar>
  );
}
