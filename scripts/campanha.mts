/** Campaign operator CLI. No sends without the explicit run-pilot confirmation. */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { runAtendimentoMigrations, aiEnabled } from '@/lib/atendimento/repository';
import { campaignSnapshot, campaignTick, importCampaignContact, setCampaignEnabled } from '@/lib/atendimento/campaign';
import { createCampaignDeps } from '@/lib/atendimento/campaignAdapter';

const [command,...args]=process.argv.slice(2);
const option=(name:string)=>{const at=args.indexOf(name);return at<0?undefined:args[at+1];};
let db:DatabaseSync|undefined;
try {
 if(!['status','import','pause','run-pilot'].includes(command))throw new Error('Comandos: status | import --file contatos.json | pause | run-pilot --confirm-pilot. Todos exigem --database caminho.sqlite.');
 const database=option('--database');
 if(!database || !existsSync(resolve(database)))throw new Error('Informe --database apontando para um banco existente. Nenhum banco é escolhido automaticamente.');
 // Safety permission check comes before opening/migrating a database.
 if(command==='run-pilot' && !args.includes('--confirm-pilot'))throw new Error('Envio bloqueado: falta --confirm-pilot. Esta opção autoriza no máximo os dois pilotos qualificados.');
 db=new DatabaseSync(resolve(database));db.exec('PRAGMA busy_timeout=5000');runAtendimentoMigrations(db);
 if(command==='status')console.log(JSON.stringify(campaignSnapshot(db),null,2));
 else if(command==='pause'){setCampaignEnabled(db,false);console.log('Campanha pausada. Atendimento normal preservado.');}
 else if(command==='import'){
  const file=option('--file');if(!file)throw new Error('Informe --file contatos.json');
  const contacts=JSON.parse(readFileSync(resolve(file),'utf8'));
  if(!Array.isArray(contacts) || contacts.length>5000)throw new Error('Arquivo de contatos inválido');
  db.exec('BEGIN IMMEDIATE');
  try {for(const contact of contacts)importCampaignContact(db,contact);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
  console.log(JSON.stringify(campaignSnapshot(db),null,2));
 } else {
  setCampaignEnabled(db,false);
  if((campaignSnapshot(db) as {dispatchBlocked:boolean}).dispatchBlocked)throw new Error('Despacho bloqueado após interrupção: reconciliar os recibos antes de reativar.');
  if(!aiEnabled(db))throw new Error('IA global pausada: campanha não será ativada.');
  const bridge=process.env.FARE_PONTE_URL?.replace(/\/$/,''), ai=process.env.FARE_IA_URL?.replace(/\/$/,'');
  if(!bridge || !ai || !process.env.FARE_PONTE_TOKEN || !process.env.FARE_IA_TOKEN)throw new Error('Ponte e IA reais precisam estar configuradas. Sem fallback simulado.');
  const [bridgeResponse,aiResponse]=await Promise.all([
   fetch(bridge+'/health',{signal:AbortSignal.timeout(10000)}),
   fetch(ai+'/saude',{headers:{'x-fare-token':process.env.FARE_IA_TOKEN},signal:AbortSignal.timeout(10000)}),
  ]);
  if(!bridgeResponse.ok || !aiResponse.ok)throw new Error('Serviços reais indisponíveis; campanha continua desativada.');
  const bridgeHealth=await bridgeResponse.json(), aiHealth=await aiResponse.json();
  if(bridgeHealth.status!=='connected' || bridgeHealth.capabilities?.campaignDelivery!==true || bridgeHealth.fareControl?.globalPaused || !aiHealth.ok || !aiHealth.model || aiHealth.capabilities?.campaignClassifier!==true)throw new Error('Health check não confirmou conexão, entrega idempotente ou classificador do atendimento.');
  let stop=false;process.once('SIGINT',()=>{stop=true;});process.once('SIGTERM',()=>{stop=true;});
  const deps=createCampaignDeps(db);setCampaignEnabled(db,true);
  console.log('Piloto ativo: máximo dois contatos qualificados. Modelo do atendimento: '+aiHealth.model);
  try {
   while(!stop){
    if(!aiEnabled(db)){setCampaignEnabled(db,false);console.error('Campanha pausada: IA global desligada.');break;}
    const state=campaignSnapshot(db) as {enabled:boolean};if(!state.enabled)break;
    await campaignTick(db,deps);await delay(1000);
   }
  }finally{setCampaignEnabled(db,false);}
 }
} catch(error){console.error(error instanceof Error?error.message:'Falha de campanha');process.exitCode=1;}
finally{db?.close();}
