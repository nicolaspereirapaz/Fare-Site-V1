"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();

  return (
    <button className="button button-secondary" onClick={async () => {
      await authClient.signOut();
      router.push("/");
      router.refresh();
    }} type="button">
      Sair da conta
    </button>
  );
}
