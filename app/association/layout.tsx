// app/association/layout.tsx
// Isolates association routes from the main site layout.
// Removes the public navbar - association dashboard has its own navigation.

export default function AssociationLayout({
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