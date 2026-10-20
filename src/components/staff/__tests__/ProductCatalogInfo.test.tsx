import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductSnapshot } from '@/components/staff/StaffDocumentPage';
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()})}));
const item={id:'item',productName:'Produto real',slug:'brindes/id',quantity:100,selections:{'Variação':'Preto'},unitPrice:10,imageUrl:null};
describe('medidas abaixo da foto',()=>{
 it('mostra só as medidas; a descrição fica na proposta e no site',()=>{
  render(<ProductSnapshot index={0} item={{...item,catalogInfo:{description:'Descrição original do fornecedor.',printingAreas:[],specs:[{label:'Medidas',value:'ø7 x 190 mm'}]}}}/>);
  expect(screen.getByText('ø7 x 190 mm')).toBeInTheDocument();
  expect(screen.queryByText('Descrição original do fornecedor.')).not.toBeInTheDocument();
  expect(screen.queryByText('Ficha técnica')).not.toBeInTheDocument();
 });
 it('sem medidas do fornecedor não mostra nada inventado',()=>{
  render(<ProductSnapshot index={0} item={item}/>);
  expect(screen.queryByText('Medidas')).not.toBeInTheDocument();
 });
 it('mostra a área real da técnica do fornecedor',()=>{
  render(<ProductSnapshot index={0} item={{...item,catalogInfo:{description:'',printingAreas:[{technique:'Serigrafia',location:'Corpo',area:'40 × 10 mm'}]}}}/>);
  expect(screen.getByText('40 × 10 mm')).toBeInTheDocument();
 });
});
