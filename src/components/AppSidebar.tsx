import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { NavLink } from "@/components/NavLink";
import { studentItems, adminItems } from "@/config/sidebarNavItems";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export { adminItems };

export function AdminSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  const { isAdmin, isTeacher } = useAuth();

  const isActive = (path: string) => {
      if (path === "/admin") {
          return currentPath === path;
      }
      return currentPath.startsWith(path);
  };

  const visibleAdminItems = adminItems.filter(item => {
      if (item.roles.includes("admin") && isAdmin) return true;
      if (item.roles.includes("teacher") && isTeacher) return true;
      return false;
  });

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border bg-background text-sidebar-foreground w-56 data-[state=collapsed]:w-16 mt-14 h-[calc(100svh-3.5rem)] z-30"
    >
      <SidebarContent className="flex h-full flex-col overflow-y-auto no-scrollbar bg-background">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/70">
              {isAdmin ? "Admin Navigation" : "Teacher Navigation"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleAdminItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      end
                      className="flex items-center gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className={`h-5 w-5 shrink-0 ${item.color || ''}`} />
                      {state === "expanded" && <span className="font-medium">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  const { isAdmin, isTeacher, profile } = useAuth();

  const isActive = (path: string) => {
      if (path === "/admin") {
          return currentPath === path;
      }
      return currentPath.startsWith(path);
  };

  const visibleAdminItems = adminItems.filter(item => {
      if (item.roles.includes("admin") && isAdmin) return true;
      if (item.roles.includes("teacher") && isTeacher) return true;
      return false;
  });

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border bg-background text-sidebar-foreground w-56 data-[state=collapsed]:w-16 mt-14 h-[calc(100svh-3.5rem)] z-30"
    >
      <SidebarContent className="flex h-full flex-col overflow-y-auto no-scrollbar bg-background">
        {profile?.registration_id && (
          <div className="px-3 pt-3 pb-2">
            <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-sidebar-foreground/60">
                {state === "expanded" ? "Your Unique ID" : "ID"}
              </p>
              {state === "expanded" && (
                <p className="mt-0.5 text-sm font-bold text-sidebar-foreground truncate">
                  {profile.full_name} ({String(profile.registration_id).slice(-5)})
                </p>
              )}
            </div>
          </div>
        )}
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/70">Student</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {studentItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      end
                      className="flex items-center gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground relative"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <div className="relative">
                          <item.icon className={`h-5 w-5 shrink-0 ${item.color || ''}`} />
                          {/* @ts-expect-error - hasDot is not in the type definition yet */}
                          {item.hasDot && (
                             <span id="desktop-announcement-dot" className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 hidden border border-background" />
                          )}
                      </div>
                      {state === "expanded" && <span className="font-medium">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {(isAdmin || isTeacher) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/70">
                {isAdmin ? "Admin Panel" : "Teacher Panel"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdminItems.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                      <NavLink
                        to={item.url}
                        end
                        className="flex items-center gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      >
                        <item.icon className={`h-5 w-5 shrink-0 ${item.color || ''}`} />
                        {state === "expanded" && <span className="font-medium">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}

export default AppSidebar;
