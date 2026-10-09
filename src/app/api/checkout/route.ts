import { auth, database } from "@/lib/auth";
import { createCheckoutHandler } from "@/lib/checkout";
import { checkoutServerDeps } from "@/lib/checkoutServerDeps";
import { createOrder } from "@/lib/orders/repository";

export const POST = createCheckoutHandler(auth.api.getSession, (input) => createOrder(database, input), checkoutServerDeps);
