import { auth } from "@/lib/auth";
import { createCheckoutHandler } from "@/lib/checkout";

export const POST = createCheckoutHandler(auth.api.getSession);
