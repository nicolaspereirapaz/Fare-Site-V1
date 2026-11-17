import type { DatabaseSync } from 'node:sqlite';
import type { MenuSelection } from './interactive';
import type { NativeSend } from './interactiveService';
export function reserveMenu(db:DatabaseSync,input:NativeSend,conversationId:string,sourceId:string){
 const state:MenuSelection={optionId:input.selection.optionId,label:input.text,status:'sending',ref:input.ref};
 if(!db.prepare('INSERT OR IGNORE INTO atd_menu_selections(ref,conversation_id,source_id,option_id,state) VALUES(?,?,?,?,?)').run(input.ref,conversationId,sourceId,input.selection.optionId,JSON.stringify(state)).changes)throw new Error('Menu already reserved');
 db.prepare('UPDATE atd_messages SET menu_selection=? WHERE id=?').run(JSON.stringify(state),sourceId);
}
export function finishMenu(db:DatabaseSync,ref:string,status:'confirmed'|'uncertain',messageId?:string){
 const row=db.prepare('SELECT * FROM atd_menu_selections WHERE ref=?').get(ref);if(!row)return;
 const state:MenuSelection={...JSON.parse(String(row.state)),status,...(messageId?{messageId}:{})};
 db.prepare('UPDATE atd_menu_selections SET state=? WHERE ref=?').run(JSON.stringify(state),ref);
 db.prepare('UPDATE atd_messages SET menu_selection=? WHERE id=?').run(JSON.stringify(state),String(row.source_id));
}
