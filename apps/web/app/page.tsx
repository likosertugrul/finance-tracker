import type { ReactElement } from "react";
import { AuthGate } from "./_components/auth-gate.js";

export default function Page(): ReactElement {
  return <AuthGate />;
}
