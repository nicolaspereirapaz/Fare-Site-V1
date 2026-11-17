import { createElement } from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { InteractiveOptions } from '@/components/staff/atendimento/InteractiveOptions';
const message:any={id:'local',conversationId:'conversation',author:'cliente',interactive:{version:1,messageId:'native',chatId:'123@lid',kind:'buttons',receivedAt:Date.now(),options:[{id:'real-id',label:'RH'}]}};
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
it('renders real clickable options, submits only identifiers and suppresses duplicate clicks',async()=>{
 const fetcher=vi.fn(async(_url:any,_init:any)=>Response.json({message:{...message,menuSelection:{status:'confirmed',label:'RH'}}}));vi.stubGlobal('fetch',fetcher);
 render(createElement(InteractiveOptions,{message}));const button=screen.getByRole('button',{name:'RH'});fireEvent.click(button);fireEvent.click(button);
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({messageId:'local',optionId:'real-id'});
 await waitFor(()=>expect(screen.getByText(/Selecionado: RH/)).toBeTruthy());expect(button).toBeDisabled();
});
it('keeps selected, uncertain and expired menus disabled on reload',()=>{
 for(const extra of [{menuSelection:{status:'uncertain',label:'RH'}},{menuSelection:{status:'confirmed',label:'RH'}},{interactive:{...message.interactive,receivedAt:1}}]){
  const view=render(createElement(InteractiveOptions,{message:{...message,...extra}}));expect(screen.getByRole('button',{name:'RH'})).toBeDisabled();view.unmount();
 }
});
it('shows the received menu body alongside the clickable options',()=>{
 render(createElement(InteractiveOptions,{message:{...message,interactive:{...message.interactive,body:'Escolha um setor para atendimento'}}}));
 expect(screen.getByText('Escolha um setor para atendimento')).toBeTruthy();
});
it('expires a mounted menu without waiting for a parent rerender',()=>{
 vi.useFakeTimers();const now=Date.now();vi.setSystemTime(now);
 render(createElement(InteractiveOptions,{message:{...message,interactive:{...message.interactive,receivedAt:now-86400000+1000}}}));
 expect(screen.getByRole('button',{name:'RH'})).not.toBeDisabled();
 act(()=>{vi.advanceTimersByTime(30000);});
 expect(screen.getByRole('button',{name:'RH'})).toBeDisabled();
});
