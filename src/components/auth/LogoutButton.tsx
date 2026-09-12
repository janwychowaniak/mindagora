import { useState } from "react";

import { Button } from "@/components/ui/button";

import { apiPost } from "@/lib/api-client";
import type { ApiSuccessResponseDTO } from "@/types";

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    setPending(true);
    setError(null);

    const result = await apiPost<ApiSuccessResponseDTO>("/api/auth/logout");
    if (!result.ok) {
      setError(result.failure.status === 0 ? result.failure.message : "Logout failed. Please try again.");
      setPending(false);
      return;
    }

    // Full navigation so the middleware sees the cleared cookies.
    window.location.assign("/login");
  };

  return (
    <div className="flex items-center gap-3">
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={handleLogout} disabled={pending}>
        {pending ? "Logging out…" : "Logout"}
      </Button>
    </div>
  );
}

export default LogoutButton;
