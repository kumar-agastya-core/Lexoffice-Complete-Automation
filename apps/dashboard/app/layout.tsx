import type { Metadata } from 'next';
import './globals.css';
import {
  Upload, AlertCircle, BookOpen, Settings, Menu, BarChart2,
  MessageSquare, Users, CreditCard,
} from 'lucide-react';
import { cookies } from 'next/headers';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Toaster } from '@/components/ui/toaster';
import { NavLink } from '@/components/NavLink';
import { getTenantId } from '@/app/lib/auth';
import { query } from '@lexware/db';
import { ActiveClientBanner } from '@/components/ActiveClientBanner';

export const metadata: Metadata = {
  title: 'Lexware Automation — Exception Tray',
  description: 'Review and resolve documents that need human input',
};

const BASE_NAV_ITEMS = [
  { href: '/assistent', icon: MessageSquare, label: 'Assistent' },
  { href: '/upload', icon: Upload, label: 'Dokumente' },
  { href: '/exceptions', icon: AlertCircle, label: 'Ausnahmen' },
  { href: '/rules', icon: BookOpen, label: 'Regeln' },
  { href: '/auswertungen', icon: BarChart2, label: 'Auswertungen' },
  { href: '/settings', icon: Settings, label: 'Einstellungen' },
  { href: '/billing', icon: CreditCard, label: 'Abrechnung' },
];

async function SidebarContent() {
  let isAgency = false;
  let activeClientName: string | null = null;
  let activeClientId: string | null = null;

  try {
    const tenantId = getTenantId();
    const cookieStore = await cookies();
    activeClientId = cookieStore.get('lx_active_tenant')?.value ?? null;

    const tenantRes = await query<{ business_type: string | null }>(
      `SELECT business_type FROM tenant_profiles WHERE id = $1 LIMIT 1`,
      [tenantId],
    );
    isAgency = tenantRes.rows[0]?.business_type === 'agency';

    if (activeClientId) {
      const clientRes = await query<{ company_name: string }>(
        `SELECT tp.company_name FROM agency_clients ac
          JOIN tenant_profiles tp ON tp.id = ac.client_tenant_id
         WHERE ac.agency_tenant_id = $1 AND ac.client_tenant_id = $2`,
        [tenantId, activeClientId],
      );
      activeClientName = clientRes.rows[0]?.company_name ?? null;
      if (!activeClientName) activeClientId = null;
    }
  } catch {
    // DB unavailable — skip
  }

  const navItems = isAgency
    ? [
        ...BASE_NAV_ITEMS.slice(0, 5),
        { href: '/mandanten', icon: Users, label: 'Mandanten' },
        ...BASE_NAV_ITEMS.slice(5),
      ]
    : BASE_NAV_ITEMS;

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4 px-3 py-2">
        <span className="text-lg font-semibold">Lexware AI</span>
      </div>
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} />
        ))}
      </nav>
      {activeClientId && activeClientName && (
        <div className="mt-auto">
          <ActiveClientBanner clientName={activeClientName} />
        </div>
      )}
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="bg-background text-foreground antialiased">
        <div className="flex h-screen overflow-hidden">
          {/* Desktop sidebar */}
          <aside className="hidden w-[220px] shrink-0 flex-col border-r md:flex">
            <SidebarContent />
          </aside>

          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Mobile header */}
            <header className="flex items-center gap-3 border-b px-4 py-3 md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Navigation öffnen</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[220px] p-0">
                  <SidebarContent />
                </SheetContent>
              </Sheet>
              <span className="text-lg font-semibold">Lexware AI</span>
            </header>

            <main className="flex-1 overflow-auto p-6">{children}</main>
          </div>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
