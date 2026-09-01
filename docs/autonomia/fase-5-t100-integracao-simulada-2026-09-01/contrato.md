# Contrato individual — T-100

## Escopo

Adicionar cenários integrados e inteiramente simulados para uma única jornada
de mentoria: mapa, metas, grafo, conversa privada e projeção do portal. Os
testes devem provar que identidade e permissões permanecem derivadas no
servidor e que conteúdo sensível não aparece na projeção mínima.

## Escopo de escrita

- `src/lib/mentoria/jornadas-integradas.test.ts`
- Ajustes mínimos em `src/lib/mentoria/**` somente se um teste apontar falha
  real e reproduzível.
- Contrato e ledger desta tarefa.

## Aceite

- O cenário exercita as fronteiras entre módulos sem usar Supabase real, rede
  ou variáveis de ambiente.
- Consentimento, isolamento entre mentorados e projeção mínima falham
  fechados.
- Vitest focado, TypeScript e revisão independente aprovados.

## Limites

Sem banco real, migrations, contas, credenciais, fornecedor de transcrição,
upload ou deploy. Célula máxima de 50 minutos; uma única escalada Luna → Terra
somente diante de bloqueio técnico persistente.
