import { DatabaseSync } from 'node:sqlite';

export class FareControl {
  constructor(dbPath, config) {
    if (!/^\d+@g\.us$/.test(config.staffGroup)) throw new Error('Grupo fixo inválido');
    if (!config.operators.length || config.operators.some(x => !/^\d{10,15}$/.test(x))) throw new Error('Operadores inválidos');
    this.config = config;
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS chats (
      phone TEXT PRIMARY KEY, chat_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
      paused INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'active',
      subject TEXT NOT NULL DEFAULT '', alert_id TEXT, updated TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS aliases (chat_id TEXT PRIMARY KEY, phone TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS customer_profiles (phone TEXT NOT NULL, profile_id TEXT NOT NULL, data TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY(phone,profile_id));
      CREATE TABLE IF NOT EXISTS active_profiles (phone TEXT PRIMARY KEY, profile_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS processed (id TEXT PRIMARY KEY, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS bot_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS handoff_context (phone TEXT NOT NULL, profile_id TEXT NOT NULL,
        status TEXT NOT NULL, subject TEXT NOT NULL, messages TEXT NOT NULL DEFAULT '[]',
        operator_note TEXT NOT NULL DEFAULT '', updated TEXT NOT NULL, PRIMARY KEY(phone,profile_id));`);
    this.tail = Promise.resolve();
  }
  serial(fn) { const p = this.tail.then(fn); this.tail = p.catch(() => {}); return p; }
  clean(v, max=100) { return String(v || '').replace(/[\r\n\x00-\x1f<>]/g, ' ').trim().slice(0,max); }
  noteInbound(chatId, phone) {
    if (!/^\d{10,15}$/.test(phone) || !this.config.customers.includes(phone)) return false;
    this.db.prepare(`INSERT INTO chats(phone,chat_id,updated) VALUES(?,?,?) ON CONFLICT(phone)
      DO UPDATE SET chat_id=excluded.chat_id,updated=excluded.updated`).run(phone,chatId,new Date().toISOString());
    this.db.prepare('INSERT INTO aliases(chat_id,phone) VALUES(?,?) ON CONFLICT(chat_id) DO UPDATE SET phone=excluded.phone').run(chatId,phone);
    this.ensureProfile(phone);
    return true;
  }
  row(id) { return this.db.prepare('SELECT * FROM chats WHERE chat_id=? OR phone=? OR phone=(SELECT phone FROM aliases WHERE chat_id=?)').get(id,id,id); }
  globalPaused() { return this.db.prepare('SELECT value FROM bot_settings WHERE key=?').get('global_paused')?.value==='1'; }
  isPaused(id) { return this.globalPaused() || !!this.row(id)?.paused; }
  updateName(chatId,name,expectedProfile=null) {
    const value=this.clean(name);
    const row=this.row(chatId);
    if (expectedProfile && this.profile(chatId)?.profile_id !== expectedProfile) return false;
    if (value && row) this.db.prepare('UPDATE chats SET name=?,updated=? WHERE phone=?').run(value,new Date().toISOString(),row.phone);
    if (row && value) this.saveProfile(chatId, {name:value}, expectedProfile || this.profile(chatId).profile_id);
    return true;
  }
  ensureProfile(phone) {
    let active=this.db.prepare('SELECT profile_id FROM active_profiles WHERE phone=?').get(phone);
    if (!active) {
      const row=this.row(phone);
      this.db.prepare('INSERT OR IGNORE INTO customer_profiles(phone,profile_id,data,updated) VALUES(?,?,?,?)')
        .run(phone,'p1',JSON.stringify({name:row?.name || '',interests:[],preferences:[],last_request:''}),new Date().toISOString());
      this.db.prepare('INSERT INTO active_profiles(phone,profile_id) VALUES(?,?)').run(phone,'p1');
      active={profile_id:'p1'};
    }
    return active.profile_id;
  }
  profile(chatId) {
    const row=this.row(chatId);
    if (!row) return null;
    const id=this.ensureProfile(row.phone);
    const saved=this.db.prepare('SELECT data FROM customer_profiles WHERE phone=? AND profile_id=?').get(row.phone,id);
    const handoff=this.db.prepare('SELECT status,subject,messages,operator_note FROM handoff_context WHERE phone=? AND profile_id=?').get(row.phone,id);
    return {profile_id:id,...JSON.parse(saved.data),...(handoff?{handoff:{...handoff,messages:JSON.parse(handoff.messages)}}:{})};
  }
  notePausedMessage(chatId,text,messageId) {
    const row=this.row(chatId);
    if (!row?.paused || !messageId || !text) return false;
    const id=this.ensureProfile(row.phone), key='paused:'+String(messageId);
    if (this.db.prepare('SELECT id FROM processed WHERE id=?').get(key)) return false;
    this.db.prepare('INSERT INTO processed(id,created) VALUES(?,?)').run(key,new Date().toISOString());
    const handoff=this.db.prepare('SELECT messages FROM handoff_context WHERE phone=? AND profile_id=?').get(row.phone,id);
    if (!handoff) return false;
    const safe=this.clean(text,300).replace(/\b\d{8,}\b/g,'[dado omitido]');
    if (!safe || /senha|password|codigo de verific|código de verific|cartao|cartão|cpf|cvv|cvc/i.test(safe)) return false;
    const messages=[...JSON.parse(handoff.messages),safe].slice(-5);
    this.db.prepare('UPDATE handoff_context SET messages=?,updated=? WHERE phone=? AND profile_id=?')
      .run(JSON.stringify(messages),new Date().toISOString(),row.phone,id);
    return true;
  }
  saveProfile(chatId, data, expectedProfile) {
    const row=this.row(chatId), current=this.profile(chatId);
    if (!row || !current || current.profile_id !== expectedProfile) return false;
    const scrub=(s,max=200)=>this.clean(s,max).replace(/\b\d{8,}\b/g,'[dado omitido]');
    const value={name:current.name,interests:current.interests,preferences:current.preferences,last_request:current.last_request};
    if (typeof data.name==='string' && data.name.trim()) value.name=scrub(data.name,100);
    for (const key of ['interests','preferences']) if (Array.isArray(data[key]))
      value[key]=data[key].filter(x=>typeof x==='string').map(x=>scrub(x,120)).filter(Boolean).slice(0,4);
    if (typeof data.last_request==='string') value.last_request=scrub(data.last_request,400);
    this.db.prepare('UPDATE customer_profiles SET data=?,updated=? WHERE phone=? AND profile_id=?')
      .run(JSON.stringify(value),new Date().toISOString(),row.phone,current.profile_id);
    if (value.name) this.db.prepare('UPDATE chats SET name=? WHERE phone=?').run(value.name,row.phone);
    return true;
  }
  selectProfile(chatId, requested=null) {
    const row=this.row(chatId);
    if (!row || row.paused) return {ok:false,reason:'paused_or_unknown'};
    if (!this.config.operators.includes(row.phone)) return {ok:false,reason:'test_operator_only'};
    let id=requested;
    if (id===null) {
      const n=this.db.prepare('SELECT COUNT(*) AS n FROM customer_profiles WHERE phone=?').get(row.phone).n;
      if (n>=50) return {ok:false,reason:'test_profile_limit'};
      id='p'+(n+1);
      this.db.prepare('INSERT INTO customer_profiles(phone,profile_id,data,updated) VALUES(?,?,?,?)')
        .run(row.phone,id,JSON.stringify({name:'',interests:[],preferences:[],last_request:''}),new Date().toISOString());
    } else if (!/^p\d+$/.test(id) || !this.db.prepare('SELECT profile_id FROM customer_profiles WHERE phone=? AND profile_id=?').get(row.phone,id)) {
      return {ok:false,reason:'unknown_profile'};
    }
    this.db.prepare('UPDATE active_profiles SET profile_id=? WHERE phone=?').run(id,row.phone);
    const profile=this.profile(chatId);
    this.db.prepare('UPDATE chats SET name=? WHERE phone=?').run(profile.name || '',row.phone);
    return {ok:true,profile_id:id};
  }
  listProfiles(chatId) {
    const row=this.row(chatId);
    if (!row || !this.config.operators.includes(row.phone)) return [];
    return this.db.prepare('SELECT profile_id,data FROM customer_profiles WHERE phone=? ORDER BY rowid').all(row.phone)
      .map(x=>({profile_id:x.profile_id,name:JSON.parse(x.data).name || 'Sem nome'}));
  }
  profileTestCommand(chatId,text,messageId) {
    const row=this.row(chatId), input=String(text || '').trim();
    if (!row || row.paused || !this.config.operators.includes(row.phone)) return null;
    if (input==='/perfis') {
      const list=this.listProfiles(chatId), active=this.profile(chatId).profile_id;
      return {handled:true,reply:list.map(p=>`${p.profile_id}${p.profile_id===active?' (ativo)':''}: ${p.name}`).join('\n')};
    }
    const select=/^\/perfil\s+(p\d+)$/i.exec(input);
    if (input!=='/novo' && !select) return null;
    const key='profile:'+String(messageId || '');
    if (!messageId || this.db.prepare('SELECT id FROM processed WHERE id=?').get(key)) return {handled:true};
    this.db.prepare('INSERT INTO processed(id,created) VALUES(?,?)').run(key,new Date().toISOString());
    const result=this.selectProfile(chatId,select?select[1].toLowerCase():null);
    if (!result.ok) return {handled:true,reply:'Perfil não encontrado ou operação indisponível. Use /perfis para consultar.'};
    return {reset:true,profile_id:result.profile_id};
  }
  async escalate(chatId, subject, send) {
    return this.serial(async () => {
      const row=this.row(chatId);
      if (!row) throw new Error('Conversa não observada/autorizada; origem não comprovada');
      if (this.globalPaused()) return {paused:true,global:true,notified:false};
      if (row.paused) return {paused:true, duplicate:true, notified:row.state==='notified', alert_id:row.alert_id};
      const topic=this.clean(subject,240) || 'Solicitação de atendimento humano';
      // Persistir a pausa ANTES de qualquer efeito externo. Nunca repetir envio incerto automaticamente.
      this.db.prepare("UPDATE chats SET paused=1,state='pending',subject=?,updated=? WHERE phone=?")
        .run(topic,new Date().toISOString(),row.phone);
      this.db.prepare(`INSERT INTO handoff_context(phone,profile_id,status,subject,messages,operator_note,updated)
        VALUES(?,?,'paused',?,'[]','',?) ON CONFLICT(phone,profile_id) DO UPDATE SET
        status='paused',subject=excluded.subject,messages='[]',operator_note='',updated=excluded.updated`)
        .run(row.phone,this.ensureProfile(row.phone),topic,new Date().toISOString());
      try {
        const text=`Atenção! ${row.name || 'Cliente não identificado'} precisa de um vendedor.\nWhatsApp: ${row.phone}\nAssunto: ${topic}\nPara liberar o bot: /retomar ${row.phone}`;
        const sent=await send(this.config.staffGroup,text);
        if (!sent?.key?.id) throw new Error('Envio sem identificador de confirmação');
        this.db.prepare("UPDATE chats SET state='notified',alert_id=?,updated=? WHERE phone=?")
          .run(sent.key.id,new Date().toISOString(),row.phone);
        let customer_ack=false;
        try { await send(row.chat_id,'Avisei nossa equipe. Vou pausar minhas respostas nesta conversa para que um vendedor possa continuar o atendimento.'); customer_ack=true; } catch {}
        return {paused:true,notified:true,alert_id:sent.key.id,customer_ack};
      } catch (e) {
        this.db.prepare("UPDATE chats SET state='notification_failed',updated=? WHERE phone=?").run(new Date().toISOString(),row.phone);
        return {paused:true,notified:false,error:'Aviso sem confirmação; conversa continua pausada. Verificar com operador.'};
      }
    });
  }
  async command(group,sender,text,messageId,send) {
    if (group !== this.config.staffGroup) return false;
    // Todo o grupo é consumido no transporte: nenhuma conversa comum vai ao modelo.
    if (!this.config.operators.includes(sender)) return true;
    const input=String(text||'').trim();
    if (input==='/pare' || input==='/retomar') {
      return this.serial(async()=>{
        const id=String(messageId||'');
        if (!id || this.db.prepare('SELECT id FROM processed WHERE id=?').get(id)) return true;
        const paused=input==='/pare';
        this.db.prepare('INSERT INTO bot_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
          .run('global_paused',paused?'1':'0');
        this.db.prepare('INSERT INTO processed(id,created) VALUES(?,?)').run(id,new Date().toISOString());
        await send(group,paused
          ? 'Bot em pausa geral. Nenhuma conversa receberá novas respostas automáticas. Para voltar: /retomar'
          : 'Pausa geral removida. O bot responderá às próximas mensagens; conversas pausadas para vendedor continuam pausadas.');
        return true;
      });
    }
    const match=/^\/retomar\s+(\d{10,15})(?:\s+([^\n]{1,400}))?\s*$/.exec(String(text||'').trim());
    if (!match) return true;
    return this.serial(async () => {
      const id=String(messageId||'');
      if (!id || this.db.prepare('SELECT id FROM processed WHERE id=?').get(id)) return true;
      this.db.prepare('INSERT INTO processed(id,created) VALUES(?,?)').run(id,new Date().toISOString());
      const row=this.row(match[1]);
      if (!row?.paused) { await send(group,'Não há uma conversa pausada para esse número.'); return true; }
      this.db.prepare("UPDATE chats SET paused=0,state='active',updated=? WHERE phone=?").run(new Date().toISOString(),row.phone);
      this.db.prepare("UPDATE handoff_context SET status='resumed',operator_note=?,updated=? WHERE phone=? AND profile_id=?")
        .run(this.clean(match[2]||'',400),new Date().toISOString(),row.phone,this.ensureProfile(row.phone));
      await send(group,this.globalPaused()
        ? `Pausa humana removida para ${row.phone}, mas o bot continua em pausa geral. Use /retomar para remover a pausa geral.`
        : `Atendimento virtual liberado para ${row.phone}. O bot responderá à próxima mensagem desse cliente.`);
      return true;
    });
  }
  close() { this.db.close(); }
}
