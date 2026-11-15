"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => {
        if (r.ok) router.push("/dashboard");
        else router.push("/login");
      })
      .catch(() => router.push("/login"))
      .finally(() => setChecking(false));
  }, [router]);

  if (checking) return null;
  return null;
}
