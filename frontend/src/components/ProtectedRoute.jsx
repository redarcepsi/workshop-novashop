import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { PageSpinner } from './ui.jsx'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <PageSpinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return children
}
