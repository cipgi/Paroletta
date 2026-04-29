import { Routes, Route } from 'react-router'
import Layout from "./components/Layout"
import Login from "./pages/Login"
import NotFound from "./pages/NotFound"
import Dashboard from "./pages/Dashboard"
import Generator from "./pages/Generator"
import Patients from "./pages/Patients"
import Sheets from "./pages/Sheets"
import SheetDetail from "./pages/SheetDetail"

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout><Dashboard /></Layout>} />
      <Route path="/generator" element={<Layout><Generator /></Layout>} />
      <Route path="/patients" element={<Layout><Patients /></Layout>} />
      <Route path="/sheets" element={<Layout><Sheets /></Layout>} />
      <Route path="/sheets/:id" element={<Layout><SheetDetail /></Layout>} />
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
