import { Routes, Route } from "react-router";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";
import Generator from "./pages/Generator";
import Sheets from "./pages/Sheets";
import SheetDetail from "./pages/SheetDetail";
import SubscriptionPage from "./pages/Subscription";
import Management from "./pages/Management";
import Invitation from "./pages/Invitation";
import ResetPassword from "./pages/ResetPassword";

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Layout>
            <Dashboard />
          </Layout>
        }
      />
      <Route
        path="/generator"
        element={
          <Layout>
            <Generator />
          </Layout>
        }
      />
      <Route
        path="/sheets"
        element={
          <Layout>
            <Sheets />
          </Layout>
        }
      />
      <Route
        path="/sheets/:id"
        element={
          <Layout>
            <SheetDetail />
          </Layout>
        }
      />
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/invito/:token" element={<Invitation />} />
      <Route
        path="/abbonamento"
        element={
          <Layout>
            <SubscriptionPage />
          </Layout>
        }
      />
      <Route
        path="/management"
        element={
          <Layout>
            <Management />
          </Layout>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
