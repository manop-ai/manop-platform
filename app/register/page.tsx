import { Suspense } from 'react'
import RegisterContent from './RegisterContent'

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div style={{ background: '#0F172A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F8FAFC' }}>
        Loading…
      </div>
    }>
      <RegisterContent />
    </Suspense>
  )
}
