import { customersForPhone } from "@/lib/atendimento/customer";
import { getConversation } from "@/lib/atendimento/repository";
import { atendimentoDb, json, readJson, text, withStaff } from "@/lib/atendimento/server";
import { createPanelCustomer, DuplicateCustomerError } from "@/lib/customers/repository";

export const dynamic = "force-dynamic";

/** Cadastra o cliente da conversa no site (mesmo cadastro da página Clientes). */
export const POST = withStaff(async (staff, request, context: RouteContext<"/api/atendimento/conversas/[id]/cliente">) => {
  const { id } = await context.params;
  const db = atendimentoDb();
  const conversation = getConversation(db, id);
  const body = await readJson(request);
  try {
    createPanelCustomer(
      db,
      { name: text(body.name, 120) || conversation.contactName, phone: conversation.phone, email: text(body.email, 200), company: text(body.company, 120) },
      staff,
    );
  } catch (error) {
    if (error instanceof DuplicateCustomerError) return json({ error: "DUPLICATE_CUSTOMER", message: "Já existe um cadastro com esses dados." }, 409);
    if (error instanceof Error) return json({ error: "INVALID_REQUEST", message: error.message }, 400);
    throw error;
  }
  return json({ customers: customersForPhone(db, conversation.phone) }, 201);
});
