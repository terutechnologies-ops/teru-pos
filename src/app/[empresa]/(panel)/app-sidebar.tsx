"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, LogOut, UserRound } from "lucide-react";

import { CompanyMark } from "@/components/shared/company-mark";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

import { logoutAction } from "./actions";
import {
  activeNavItemId,
  NAV_GROUP_ICONS,
  NAV_GROUP_LABELS,
  NAV_ITEMS,
  navHref,
  type NavGroup,
} from "./navigation";

// Sección activa: lima con texto negro (también el ícono).
const activeClass =
  "data-active:bg-sidebar-primary data-active:font-semibold data-active:text-sidebar-primary-foreground data-active:[&>svg]:text-sidebar-primary-foreground";

// Menú lateral. Recibe del servidor qué secciones puede ver esta persona;
// aquí solo se dibujan. Inicio va siempre a la vista; los demás grupos se
// despliegan y sus secciones van con sangría bajo una línea guía. Al
// cargar se abre el grupo de la página actual; al navegar a otro grupo,
// ese también se abre (los demás quedan como la persona los dejó).
export function AppSidebar({
  companySlug,
  companyName,
  logoUrl,
  userName,
  roleLabel,
  itemIds,
}: {
  companySlug: string;
  companyName: string;
  logoUrl: string | null;
  userName: string;
  roleLabel: string;
  itemIds: readonly string[];
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => itemIds.includes(item.id));
  const groups = [...new Set(items.map((item) => item.group))] as NavGroup[];
  const activeId = activeNavItemId(companySlug, pathname, items);
  const activeGroup = items.find((item) => item.id === activeId)?.group ?? null;

  const [openGroups, setOpenGroups] = useState<ReadonlySet<NavGroup>>(
    () => new Set(activeGroup ? [activeGroup] : []),
  );
  // Ajuste durante el render (no en un efecto): abre el grupo al que se llegó.
  const [lastActiveGroup, setLastActiveGroup] = useState(activeGroup);
  if (activeGroup !== lastActiveGroup) {
    setLastActiveGroup(activeGroup);
    if (activeGroup && !openGroups.has(activeGroup)) {
      setOpenGroups(new Set(openGroups).add(activeGroup));
    }
  }
  function setGroupOpen(group: NavGroup, open: boolean) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (open) next.add(group);
      else next.delete(group);
      return next;
    });
  }

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <CompanyMark logoUrl={logoUrl} companyName={companyName} size="sm" />
          <span className="truncate text-base leading-6 font-bold tracking-tight">
            {companyName}
          </span>
        </div>
      </SidebarHeader>
      <SidebarSeparator className="mx-0" />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {groups.map((group) => {
                const groupItems = items.filter((item) => item.group === group);

                if (group === "general") {
                  return groupItems.map((item) => {
                    const active = item.id === activeId;
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton asChild isActive={active} className={`h-10 ${activeClass}`}>
                          <Link
                            href={navHref(companySlug, item)}
                            aria-current={active ? "page" : undefined}
                          >
                            <Icon aria-hidden />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  });
                }

                const open = openGroups.has(group);
                const GroupIcon = NAV_GROUP_ICONS[group];
                return (
                  <Collapsible
                    key={group}
                    asChild
                    open={open}
                    onOpenChange={(next) => setGroupOpen(group, next)}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton className="h-10 font-semibold">
                          <GroupIcon aria-hidden />
                          <span>{NAV_GROUP_LABELS[group]}</span>
                          {/* Cerrado con la página actual adentro: un punto lo indica. */}
                          {!open && group === activeGroup && (
                            <span
                              className="size-1.5 shrink-0 rounded-full bg-highlight"
                              aria-hidden
                            />
                          )}
                          <ChevronDown
                            aria-hidden
                            className="ml-auto text-brand-muted-foreground transition-transform group-data-[state=open]/collapsible:rotate-180"
                          />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub className="mr-0 ml-5 gap-0.5 border-brand-muted-foreground/30 py-1 pr-0 pl-3">
                          {groupItems.map((item) => {
                            const active = item.id === activeId;
                            const Icon = item.icon;
                            return (
                              <SidebarMenuSubItem key={item.id}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={active}
                                  className={`h-9 text-sidebar-foreground/85 [&>svg]:text-brand-muted-foreground ${activeClass}`}
                                >
                                  <Link
                                    href={navHref(companySlug, item)}
                                    aria-current={active ? "page" : undefined}
                                  >
                                    <Icon aria-hidden />
                                    <span>{item.label}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator className="mx-0" />
      <SidebarFooter className="gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{userName}</p>
          <p className="text-xs text-brand-muted-foreground">{roleLabel}</p>
        </div>
        <div className="flex flex-col gap-1">
          <SidebarMenuButton
            asChild
            isActive={pathname === `/${companySlug}/cuenta`}
            className={`h-9 ${activeClass}`}
          >
            <Link href={`/${companySlug}/cuenta`}>
              <UserRound aria-hidden />
              <span>Mi cuenta</span>
            </Link>
          </SidebarMenuButton>
          <form action={logoutAction.bind(null, companySlug)}>
            <SidebarMenuButton type="submit" className="h-9">
              <LogOut aria-hidden />
              <span>Cerrar sesión</span>
            </SidebarMenuButton>
          </form>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
