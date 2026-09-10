# Revisão independente T-144

- Data: 2026-09-10
- Revisor: gpt-5.6-sol, distinto do executor gpt-5.6-terra
- Decisão: **REPROVADA**

## Achados

### P1 — a lista nova falsifica estados Google e UAT

`src/app/(app)/integracoes/page.tsx:124-125` usa sempre “Esta organização ainda não autorizou o Google Calendar” para qualquer Google pendente. Assim, conexão revogada, erro de armazenamento, falta de autorização da sessão e rejeição da consulta são apresentados como se nunca tivesse havido autorização. O cartão guiado diferencia esses casos, mas a nova lista completa não.

No UAT, `page.tsx:368-378` substitui corretamente o detalhe por “Bloqueada neste login de homologação”, porém `orientacaoPendente()` ignora esse estado e volta a mostrar motivos e próximos passos de conexão real. A lista visível precisa preservar o motivo de isolamento e não orientar conexão/ativação no login sintético.

Correção necessária: derivar a orientação Google do `ResultadoConexaoGoogle` fechado e fornecer uma orientação específica para UAT. Cobrir na seção `data-integracoes-pendentes="todas"` os estados não conectado, revogado, erro/rejeição e UAT, provando mensagem correta, ausência de sucesso e ausência de ação OAuth no UAT.

### P1 — flags globais viram “Conexão ativa para esta organização”

`src/app/(app)/integracoes/page.tsx:139-142` retorna “Conexão ativa para esta organização” para qualquer item conectado e sem pendência. STT, IA, Meta, TikTok e gateway continuam baseados em flags/configuração global; isso não comprova ativação por organização nem homologação com fornecedor. O rodapé faz a ressalva, mas não corrige a afirmação individual mais forte.

Usar descrição honesta por tipo: Google pode afirmar vínculo da organização; integrações baseadas em configuração devem indicar apenas configuração local detectada e homologação não confirmada. Adicionar teste com flags globais ativas que proíba “ativa para esta organização” nesses itens.

### P2 — o teste não prova oito linhas dentro do inventário

`src/app/(app)/integracoes/page.test.tsx:55-56` fatia de `data-integracoes-inventario="completo"` até `id="eventos-integracoes"`; esse trecho contém também a lista de pendências. Portanto, o teste em `page.test.tsx:202+` pode encontrar sete nomes somente nas pendências mesmo que faltem no inventário.

Criar recorte exclusivo do inventário, terminando antes de `data-integracoes-pendentes="todas"`, e verificar as oito linhas/IDs dentro dele. Manter o recorte separado de pendências para provar que ambas as listas são visíveis antes do `<details>`.

## Evidência própria e pontos aprovados

- `node node_modules/vitest/vitest.mjs run "src/app/(app)/integracoes/page.test.tsx" "src/lib/integracoes/conexao-assistida.test.ts" --reporter=verbose`: **2 arquivos, 21/21 testes aprovados**.
- `git diff --check`: exit 0; apenas avisos LF/CRLF.
- A implementação realmente remove `slice`/`line-clamp`, renderiza as oito integrações antes do diagnóstico, inclui planilha parcial, exclui Google conectado e iCal artificial das pendências, mostra total e vazio e preserva home/estilos globais no diff.
- A regressão 112/112 foi registrada pelo coordenador; TypeScript não foi repetido em paralelo.

Nenhum código, Git, deploy, fornecedor, banco, credencial ou dado real foi alterado nesta revisão.
