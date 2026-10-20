import { database } from "@/lib/auth";
import { getStoreSession } from "@/lib/auth/storeSession";
import { createCheckoutHandler } from "@/lib/checkout";
import { checkoutServerDeps } from "@/lib/checkoutServerDeps";
import { createOrder } from "@/lib/orders/repository";

export const POST = createCheckoutHandler(getStoreSession, (input) => createOrder(database, input), checkoutServerDeps);
