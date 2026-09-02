# Contrato individual — T-108

## Escopo

Redesenhar localmente a agenda e os elementos de sessão da ficha para tornar
o próximo encontro, o estado de transcrição privada e as relações legíveis.
Preservar os fluxos, ações, links e textos de consentimento já existentes.

## Critérios de aceite

- A agenda prioriza o que acontece agora e a navegação por período.
- O estado de uma transcrição continua privado por padrão; conteúdo não passa
  a ser impresso fora da projeção vigente.
- Qualquer escrita do Google continua descrita com precisão e limitada ao
  evento de sessão já marcado pela aplicação.
- Grafo usa relações registradas, sem diagnóstico nem causa clínica.

## Validação

- TDD de renderização/rotas alteradas.
- Testes focados, TypeScript, `git diff --check` e revisão independente.

## Limites

Sem provedor novo, credencial, banco, Supabase, migration, RLS, produção,
deploy, transcrição externa ou alteração de consentimento.
