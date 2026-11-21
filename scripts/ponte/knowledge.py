"""Seleção local de FAQ. Não usa IA, rede, embeddings ou ferramentas do cliente."""
from pathlib import Path
import re
import unicodedata


def norm(text):
    return ''.join(c for c in unicodedata.normalize('NFD',str(text or '').lower()) if unicodedata.category(c)!='Mn')


def sections(home):
    text=(Path(home)/'FAQ_FARE_FOTO.md').read_text(encoding='utf-8')
    chunks=re.split(r'^## ([a-z_]+)\s*$',text,flags=re.M)
    return {chunks[i]:chunks[i+1].strip() for i in range(1,len(chunks),2)}


def document_photo(text):
    t=norm(text)
    return bool(re.search(r'\b(?:pas+aporte|vistos?)\b|\b(?:3\s*[x×]\s*4|5\s*[x×]\s*[57]|3[,.]5\s*[x×]\s*4[,.]5)\b|\bfotos?\b[^\n]{0,60}\b(?:documentos?|identidade|rg|cnh)\b|\bdocumentos?\b[^\n]{0,60}\bfotos?\b',t))


def service(text):
    t=norm(text)
    result=[]
    if document_photo(t) or re.search(r'\b(foto\w*|revela\w*|polaroid|instax|amplia\w*|retro)\b',t): result.append('fotos')
    if re.search(r'\b(grafica|panfleto\w*|flyer\w*|banner\w*|lona\w*|convite\w*|cardapio\w*|folder\w*|adesivo\w*|etiqueta\w*|tag\w*)\b|cartao|cartoes',t): result.append('grafica')
    if re.search(r'\b(brinde\w*|caneca\w*|garrafa\w*|squeeze\w*|caneta\w*|mochila\w*|agendas?|caderno\w*|kit\w*)\b',t): result.append('brindes')
    if not result and re.search(r'\d+\s*[x×]\s*\d+',t): result.append('fotos')
    return result


def select_knowledge(home,message='',history=None,profile=None):
    available=sections(home)
    t=norm(message)
    ids=[]
    def add(key):
        if key in available and key not in ids: ids.append(key)
    # Perguntas gerais claras não arrastam tabelas de um assunto anterior.
    if re.search(r'horario|expediente|abert|fechad|sabado|domingo|feriado|que horas',t): add('horarios')
    if re.search(r'endereco|onde fica|localiza|quais servicos|o que voces fazem|o que faz',t): add('geral')
    if re.search(r'pix|pagamento|pagar|parcel|cartao de credito|frete|entrega|retira|cep|pedido foi',t): add('pagamento_entrega')
    if re.search(r'prazo|demora|quando fica|fica pront|quanto tempo|urgente',t): add('prazos')
    if re.search(r'vendedor|atendente|humano',t): add('vendedor')
    topics=service(message)
    context_text=str(message or '')
    if not topics and (not ids or ids==['prazos']):
        for msg in reversed((history or [])[-8:]):
            if isinstance(msg,dict) and msg.get('role')=='user' and isinstance(msg.get('content'),str):
                candidates=service(msg['content'])
                if candidates:
                    topics=candidates
                    context_text=msg['content']+' '+context_text
                    break
        if not topics and isinstance(profile,dict):
            context_text=' '.join(str(x) for x in profile.get('interests',[]))+' '+str(profile.get('last_request',''))+' '+context_text
            topics=service(context_text)
    for topic in topics:
        if topic=='fotos' and document_photo(context_text):
            if 'prazos' in ids: ids.remove('prazos')
            add('fotos_documentos')
            continue
        add(topic)
        if topic=='fotos':
            context=norm(context_text)
            other=re.search(r'polaroid|instax|retro|amplia|grande formato',context)
            dimensions=re.findall(r'(\d+)\s*[x×]\s*(\d+)',context)
            if dimensions and any(tuple(sorted((int(a),int(b)))) not in ((9,12),(10,15),(13,18),(15,21)) for a,b in dimensions):
                other=True
            if other: add('outros_precos_fotos')
            elif re.search(r'prec|cust|valor|orcamento|\d+\s*[x×]\s*\d+',context): add('precos_revelacao')
    if not ids: add('geral')
    return {'section_ids':ids,'text':'\n\n'.join('## '+key+'\n'+available[key] for key in ids)}
