// @vitest-environment node
import { expect, it, vi } from "vitest";
const handlers=vi.hoisted(()=>({pdf:vi.fn(async()=>new Response("pdf")),send:vi.fn(async()=>Response.json({text:"pedido"}))}));
vi.mock("@/lib/proposals/server",()=>({orderDocumentHandlers:handlers}));
import { GET, POST, dynamic, runtime } from "./route";
it("encaminha ID interno e request para ambos handlers sem trocar por código público",async()=>{
 const request=new Request("http://x/api/backoffice/orders/internal-id/documento?ver=1");
 const context={params:Promise.resolve({code:"internal-id"})};
 expect(await (await GET(request,context)).text()).toBe("pdf");
 expect(await (await POST(request,context)).json()).toEqual({text:"pedido"});
 expect(handlers.pdf).toHaveBeenCalledWith(request,"internal-id");expect(handlers.send).toHaveBeenCalledWith(request,"internal-id");expect(dynamic).toBe("force-dynamic");expect(runtime).toBe("nodejs");
});
