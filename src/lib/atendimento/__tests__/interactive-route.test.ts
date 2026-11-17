import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const shared=vi.hoisted(()=>({db:null as any,session:null as any}));
vi.mock('@/lib/auth',()=>({get database(){return shared.db;}}));
vi.mock('@/lib/staff/server',()=>({readStaffSession:async()=>shared.session}));
import { POST } from '@/app/api/atendimento/conversas/[id]/menu/route';
import { runAtendimentoMigrations,createConversation,listMessages } from '../repository';
import { receiveWhatsAppMessage,parseInbound } from '../whatsapp';
beforeEach(()=>{vi.useFakeTimers();shared.db=new DatabaseSync(':memory:');runAtendimentoMigrations(shared.db);shared.session=null;});afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();shared.db.close();vi.unstubAllGlobals();});

it('authenticated endpoint ignores client destination/text, sends native payload and persists receipt',async()=>{
 shared.session={user:{id:'s',name:'Staff',role:'admin'}};vi.stubEnv('FARE_PONTE_URL','https://fake');vi.stubEnv('FARE_PONTE_TOKEN','fake');
 const menu={version:1,messageId:'native',chatId:'123@lid',kind:'buttons',receivedAt:Date.now(),options:[{id:'rh-id',label:'RH'}]};
 const {conversationId}=receiveWhatsAppMessage(shared.db,parseInbound({externalId:'native',chatId:'123@lid',phone:'5511991665576',text:'Menu',interactive:menu}));const source=listMessages(shared.db,conversationId)[0];
 const fetcher=vi.fn(async(_url:any,init:any)=>{const input=JSON.parse(init.body);return Response.json({status:'confirmed',success:true,ref:input.ref,messageId:'native-receipt'});});vi.stubGlobal('fetch',fetcher);
 const other=createConversation(shared.db,{channel:'whatsapp',phone:'5511000000099'});
 const body={messageId:source.id,optionId:'rh-id',chatId:'attacker@lid',text:'forged'};
 const cross=await POST(new Request('https://local/menu',{method:'POST',body:JSON.stringify(body)}),{params:Promise.resolve({id:other.id})});expect(cross.status).toBe(400);expect(fetcher).not.toHaveBeenCalled();
 const response=await POST(new Request('https://local/menu',{method:'POST',body:JSON.stringify(body)}),{params:Promise.resolve({id:conversationId})});expect(response.status).toBe(200);
 const sent=JSON.parse(fetcher.mock.calls[0][1].body);expect(sent).toMatchObject({chatId:'123@lid',text:'RH',selection:{messageId:'native',optionId:'rh-id'}});expect(sent.ref).toMatch(/^menu:[a-f0-9]{64}$/);
 expect(listMessages(shared.db,conversationId)[0].menuSelection).toMatchObject({status:'confirmed',messageId:'native-receipt'});vi.unstubAllEnvs();
});

it('requires staff authentication before looking up or sending menu',async()=>{
 const response=await POST(new Request('https://local/menu',{method:'POST',body:'{}'}),{params:Promise.resolve({id:'missing'})});expect(response.status).toBe(401);
});
it('rejects cross-conversation choice before bridge call',async()=>{
 shared.session={user:{id:'s',name:'Staff',role:'admin'}};const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const c=createConversation(shared.db,{channel:'whatsapp',phone:'5511991665576'});
 const response=await POST(new Request('https://local/menu',{method:'POST',body:JSON.stringify({messageId:'missing',optionId:'fake',chatId:'attacker@lid',text:'fake'})}),{params:Promise.resolve({id:c.id})});expect(response.status).toBe(400);expect(fetcher).not.toHaveBeenCalled();
});
