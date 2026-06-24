import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "../pages/login/LoginPage";
import RegisterPage from "../pages/register/RegisterPage";
import AppLayout from "../components/layout/AppLayout";
import UserCenterPage from "../pages/user-center/UserCenterPage";
import AiConfigPage from "../pages/ai-config/AiConfigPage";
import LiveAssistantPage from "../pages/live-assistant/LiveAssistantPage";
import { GuestRoute, ProtectedRoute } from "./guards";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/user-center" element={<UserCenterPage />} />
          <Route path="/ai-config" element={<AiConfigPage />} />
          <Route path="/live-assistant" element={<LiveAssistantPage />} />
        </Route>
        <Route path="/console" element={<Navigate to="/user-center" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
