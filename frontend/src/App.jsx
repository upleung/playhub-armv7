import React from 'react'
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import AppLayout from './components/AppLayout'
import HomeView from './views/HomeView'
import DetailView from './views/DetailView'
import PlayerView from './views/PlayerView'
import HistoryView from './views/HistoryView'
import LiveView from './views/LiveView'

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<HomeView />} />
        <Route path="/detail" element={<DetailView />} />
        <Route path="/player" element={<PlayerView />} />
        <Route path="/history" element={<HistoryView />} />
        <Route path="/live" element={<LiveView />} />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppLayout>
        <AnimatedRoutes />
      </AppLayout>
    </HashRouter>
  )
}
