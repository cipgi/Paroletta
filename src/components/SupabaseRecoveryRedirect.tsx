import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { hasPasswordRecoveryCallback } from "@/lib/supabase-password-reset";

export function SupabaseRecoveryRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (
      location.pathname === "/reset-password" ||
      !hasPasswordRecoveryCallback()
    ) {
      return;
    }

    navigate(`/reset-password${location.search}${location.hash}`, {
      replace: true,
    });
  }, [location.hash, location.pathname, location.search, navigate]);

  return null;
}
