import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Boosters from './pages/Boosters.jsx'
import CardDetail from './pages/CardDetail.jsx'
import Cards from './pages/Cards.jsx'
import Cart from './pages/Cart.jsx'
import Checkout from './pages/Checkout.jsx'
import Collection from './pages/Collection.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import OrderDetail from './pages/OrderDetail.jsx'
import Orders from './pages/Orders.jsx'
import PokeDollars from './pages/PokeDollars.jsx'
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

const protect = (page) => <ProtectedRoute>{page}</ProtectedRoute>

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="cards" element={<Cards />} />
          <Route path="cards/:slug" element={<CardDetail />} />
          <Route path="boosters" element={<Boosters />} />
          <Route path="pokedollars" element={<PokeDollars />} />
          <Route path="collection" element={protect(<Collection />)} />
          <Route path="cart" element={<Cart />} />
          <Route path="checkout" element={protect(<Checkout />)} />
          <Route path="orders" element={protect(<Orders />)} />
          <Route path="orders/:id" element={protect(<OrderDetail />)} />
          {/* Anciennes adresses de la boutique */}
          <Route path="products/*" element={<Navigate to="/cards" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
