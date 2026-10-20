import { database } from "@/lib/auth";
import { createProposalHandlers } from "@/lib/proposals/handlers";
import { renderProposalHtml } from "@/lib/proposals/html";
import { documentDetailsOf, documentImageOf } from "@/lib/proposals/catalogImages";
import { createOrderDocumentHandlers } from "@/lib/proposals/orderHandlers";
import { renderOrderHtml } from "@/lib/proposals/html";
import { readStaffSession } from "@/lib/staff/server";


/** Endereço público do site usado nos links do HTML (produção: https://www.farefoto.com.br). */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.farefoto.com.br";

export const proposalHandlers = createProposalHandlers({
  getSession: readStaffSession as never,
  database: () => database,
  siteUrl: SITE_URL,
  imageOf: documentImageOf,
  detailsOf: documentDetailsOf,
  render: renderProposalHtml,
});

export const orderDocumentHandlers = createOrderDocumentHandlers({
  getSession: readStaffSession as never,
  database: () => database,
  siteUrl: SITE_URL,
  imageOf: documentImageOf,
  detailsOf: documentDetailsOf,
  render: renderOrderHtml,
});
