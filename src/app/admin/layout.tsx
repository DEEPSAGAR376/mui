/**
 * Admin shell.
 *
 * The redirect is a courtesy, not the boundary. Every write below this route
 * goes through an RPC that asserts `is_admin()` itself, and the UploadThing
 * endpoints re-check in their middleware — so a non-admin who reaches these
 * pages some other way can still do nothing. Guarding here just avoids showing
 * someone a screen whose every button would fail.
 */

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/supabase/server';
import { AdminNav } from '@/components/admin/AdminNav';

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  if (!(await isAdmin())) redirect('/login');

  return (
    <div className="flex flex-col gap-6">
      <AdminNav />
      {children}
    </div>
  );
}
