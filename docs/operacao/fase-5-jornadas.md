# Fase 5 — matriz de jornadas locais

## Escopo observado

Leitura seletiva dos módulos de mentoria, telas relacionadas e migrations
0029/0038–0042 já aplicadas no MentorOS main. Esta matriz descreve cobertura
local; não é uma leitura de dados de clientes nem uma homologação externa.

| Jornada | Código e tela | Schema aplicado | Evidência local | Próximo passo seguro |
| --- | --- | --- | --- | --- |
| Mapa do cliente | `mapa-cliente.ts`, `dados-atendimento.ts`, `mapa-atendimento.tsx` | `atendimento_mapa`, consentimento e trilha de acesso (0038) | Validação de 11 dimensões, notas explícitas e isolamento por cliente | T-100: cobrir fluxo combinado com permissão e leitura simulada |
| Metas e plano de ação | `plano-acao.ts`, `dados-atendimento.ts`, `plano-acao.tsx` | `atendimento_meta`, `atendimento_passo`, `atendimento_reflexao` (0039) | Testes de prazo, ordenação, responsáveis e estados de passo | T-100: cobrir consentimento e projeção mínima juntos |
| Grafo do atendimento | `grafo-cliente.ts`, `grafo.tsx` | `atendimento_grafo_no`, `atendimento_grafo_relacao` (0040) | Testes bloqueiam transcrição sem autorização e descartam texto acidental | T-100: testar a composição com dados de mapa e metas simulados |
| Transcrição privada | `acoes-transcricao-arquivo.ts`, `acoes-transcricao.ts` | consentimento e arquivo por sessão; bucket privado (0041) | Testes exigem sessão, caminho, hash e consentimento; não chamam fornecedor | T-103, fora desta fila: fornecedor, retenção e confirmação no momento da ação |
| Conversa e contrato no portal | `acoes-mensagem.ts`, `portal.ts`, `portal/page.tsx` | `mensagem_mentoria`, `contrato.visivel_portal` e função de portal (0029/0042) | Testes derivam identidade no servidor e usam função mínima de contrato | T-100 e T-101: cenários simulados de isolamento e apresentação |

## Lacunas classificadas

1. **Local, tratável na T-100:** os módulos têm testes unitários e de ação,
   mas faltam cenários simulados que atravessem mapa, metas, grafo, mensagem e
   portal sob uma mesma identidade/permissão.
2. **Local, tratável na T-101:** confirmar que as telas apresentam estados
   seguros quando a leitura retorna vazio, sem permissão ou sem consentimento.
3. **Documentação técnica:** os comentários iniciais das migrations 0038–0042
   ainda descrevem estado “local/não aplicada”. O código SQL foi aplicado
   fielmente no MentorOS em 01/09/2026; a divergência é editorial, não muda a
   execução nem o histórico real. Ela fica como limpeza documental posterior,
   sem reescrever migrations aplicadas.
4. **Externa, bloqueada:** homologação autenticada com contas sintéticas
   (T-102) e qualquer envio a fornecedor de transcrição (T-103). Ambas exigem
   confirmação específica; não entram em testes locais.
