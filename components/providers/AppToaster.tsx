"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const Toaster = dynamic(() => import("sonner").then((mod) => mod.Toaster), {
  ssr: false,
});

export function AppToaster() {
  const pathname = usePathname();

  if (pathname === "/") {
    return null;
  }

  return <Toaster theme="dark" position="bottom-center" richColors closeButton />;
}
