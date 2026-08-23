// app/admin/layout.tsx  
// Isolates admin routes from the main site layout.
// Admin has its own sidebar navigation.

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={{ isolation: 'isolate' }}>
      {children}
    </div>
  )
}