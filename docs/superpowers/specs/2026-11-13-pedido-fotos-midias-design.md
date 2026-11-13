# Pedido de fotos pela janela de Mídias (Atendimento) — desenho curto

Aprovado pelo Nicolas em 13/11/2026 ("Publique tudo").

## Por quê
Criar pedido de revelação a partir das fotos do WhatsApp tem de ser intuitivo para o funcionário:
vários tamanhos, ver o valor, editar todas as fotos e depois registrar o pagamento.
Hoje a janela de Mídias tem um formulário com um tamanho só para todas as fotos, e editar/pagar fica espalhado.

## Objetivos
- Mesma foto em mais de um tamanho, e fotos diferentes em tamanhos diferentes.
- Valor atualizando enquanto escolhe.
- Edição com o editor do site (cortar, filtros, ajustes, borda, "usar em todas").
- Preço por tamanho editável + desconto no total (pela equipe).
- Pagamento: só registrar (forma, valor, data). Sem cobrança automática.

## Fora do escopo
- Cadastro do cliente dentro do fluxo (continua: cadastrar antes, na lateral da conversa).
- Mandar cobrança/link de pagamento automaticamente.

## Caminhos considerados
- A. Tela própria em 4 etapas dentro do Atendimento: mais intuitiva, mas muito código novo no servidor.
- **B. Reaproveitar o link de fotos (escolhido)**: quase tudo já existe (editor, preço ao vivo,
  "Editar pedido" com preço especial e desconto, "Registrar pagamento"); falta ligar as peças e tirar o jeito de tela do cliente.
- C. Tudo na janelinha de Mídias: apertado demais para o editor e para o celular.

## Como fica (B)
1. **Mídias** (`PhotoOrderForm`): campos Cliente, Tamanho e Papel iniciais, Entrega. Cópias e ajuste saem (vão para o editor).
   Botão "Criar e abrir editor": cria o pedido como hoje (`createChatPhotoOrder`), gera o link de fotos do pedido
   (`createPhotoLink`) e abre `/fotos/<token>?editar=1` em outra aba (aba aberta no clique, para o navegador não bloquear).
2. **Link em modo equipe**: a página do link vê se há sessão da equipe (`getStaffSession`). Se sim:
   - textos para a equipe (título "Pedido PED-x · Cliente", botão "Salvar fotos no pedido", sem "o valor é confirmado pela loja");
   - botão **Duplicar** em cada foto (cópia logo depois da original, mesmo envio, para sair em outro tamanho);
   - depois de salvar: "Fotos salvas no pedido PED-x" + **Abrir pedido (preço e pagamento)** → `/equipe/pedidos/<id>` + "Editar fotos de novo".
   O cliente que abre o mesmo link não vê nada disso (sem sessão da equipe).
3. **Pedido**: "Editar pedido" acerta preço por tamanho e desconto. Pedido sem recebimento (como os de Mídias) ganha o botão
   **Fechar Pedido** na própria página (antes só no cartão do quadro): forma, valor (sinal/total/na retirada), data e entrega.

Achado no teste local: depois de salvar com `?editar=1`, a tela do link reabria o editor sozinha (já acontecia no "Editar fotos").
Agora só reabre ao abrir a página.

## Riscos / decisões do construtor
- O pedido é montado duas vezes (ao criar e ao salvar do editor). Medir no teste local; se ficar lento, montar só ao salvar.
- A mesma foto duplicada: o servidor lê o envio uma vez (`readPhotos`) e copia o original uma vez por foto (`foto-N`). Coberto por teste.
- O endereço do pedido (id interno) só vai para a página quando há sessão da equipe.
