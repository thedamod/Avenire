/**
 * Provides the dashboard page layout and renders its children inside a full-height main container.
 *
 * @param children - React nodes to render inside the dashboard layout
 * @returns The root `<main>` element containing `children`
 */
export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <main className="min-h-screen bg-background text-foreground">{children}</main>;
}
