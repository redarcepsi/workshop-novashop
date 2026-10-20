import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Cart from './pages/Cart.jsx'
import Checkout from './pages/Checkout.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import OrderDetail from './pages/OrderDetail.jsx'
import Orders from './pages/Orders.jsx'
import ProductDetail from './pages/ProductDetail.jsx'
import Products from './pages/Products.jsx'
import Register from './pages/Register.jsx'

function ScrollToTop() {
  const { pathname } = useLocation()
  // Accolades obligatoires : dans les Chromium récents, scrollTo() renvoie une Promise, que React
  // prendrait pour une fonction de nettoyage (→ "destroy is not a function" et page blanche).
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="products" element={<Products />} />
          <Route path="products/:slug" element={<ProductDetail />} />
          <Route path="cart" element={<Cart />} />
          <Route
            path="checkout"
            element={
              <ProtectedRoute>
                <Checkout />
              </ProtectedRoute>
            }
          />
          <Route
            path="orders"
            element={
              <ProtectedRoute>
                <Orders />
              </ProtectedRoute>
            }
          />
          <Route
            path="orders/:id"
            element={
              <ProtectedRoute>
                <OrderDetail />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
