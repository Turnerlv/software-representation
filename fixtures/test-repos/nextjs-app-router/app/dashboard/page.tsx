// Next.js App Router Page component
// File path: app/dashboard/page.tsx

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default async function DashboardPage() {
  return (
    <main>
      <h1>Dashboard</h1>
    </main>
  );
}
