import { useState } from "react";

import { Button } from "@/components/ui/button";

import { NETWORK_ERROR_MESSAGE } from "./auth-api";

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        setError("Logout failed. Please try again.");
        setPending(false);
        return;
      }

      // Full navigation so the middleware sees the cleared cookies.
      window.location.assign("/login");
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
      setPending(false);
    }
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
