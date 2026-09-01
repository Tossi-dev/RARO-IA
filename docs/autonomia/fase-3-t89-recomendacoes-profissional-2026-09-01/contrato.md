# Contrato de execução — T-089

## Escopo autorizado

Tornar recomendações de risco visíveis apenas ao profissional, como perguntas
de acompanhamento com fatos de origem e grau de incerteza. Inclui testes e
telas locais; não inclui diagnóstico, prescrição, comunicação ao cliente,
banco real, deploy, credenciais, dados reais ou integração externa.

## Critérios de aceite

- Cada sugestão explica fatos de origem e incerteza sem fazer diagnóstico.
- A linguagem orienta pergunta aberta; não oferece caminho ou decisão pelo
  cliente.
- A informação permanece restrita à ficha/equipe, nunca ao portal.
- Testes focados, TypeScript e revisão independente aprovados.

## Células

1. Mapear `alertas-risco` e a visão de risco existente, preservando escopo.
2. Escrever testes de fatos, incerteza, pergunta aberta e privacidade.
3. Implementar a projeção mínima e validar.
4. Revisar, registrar evidências e publicar Git após aprovação.

## Limites

Sem banco real, produção, deploy, integração externa, segredos, dados reais,
diagnóstico ou mensagens ao cliente. Cada célula tem checkpoint antes de 50
minutos; dois pulsos sem delta pausam somente a tarefa.

## Conclusão

Concluída localmente em 2026-09-01: 11 testes focados e TypeScript sem
emissões aprovados; revisão independente aprovou sem achados. A recomendação
é apenas uma pergunta revisável no painel interno.
