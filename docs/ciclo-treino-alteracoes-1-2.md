# Alteração 1 do ciclo de treino

- Reutilizar o seletor oficial do Plano da semana. Tocar num dia abre a escolha entre os treinos da etapa ou descanso; horário permanece editável.
- Metas ficam dentro da etapa, no Planejamento, com vínculo e prazo da etapa predefinidos.
- Evolução seleciona uma etapa e usa somente registros do período correspondente. Peso corporal não deve usar medições posteriores ao período.
- Preservar edição de nome, foco e duração como configuração secundária. Não apagar metas antigas do ciclo inteiro.

# Alteração 2 — confronto e decisões

O problema não é falta de funções: é descobrir por onde começar e entender o resultado. A montagem deve seguir: treinos → semana → metas. Configurações não devem competir com esse caminho.

- Oferecer um próximo passo contextual para montar a primeira etapa incompleta (treinos, exercícios ou semana); não prescrever exercícios, cargas ou frequência.
- Usar três abas: Planejamento, Cronograma e Evolução. Metas ficam no contexto da etapa; metas antigas sem etapa continuam acessíveis no Planejamento, com opção de vincular, sem migração automática.
- Mostrar evolução de carga e peso com início, último registro e variação. Não chamar qualquer aumento de peso corporal de melhora. Não equiparar prazo decorrido a treinos concluídos.
- Filtrar os treinos realizados pelos treinos daquela etapa, não por qualquer sessão nas mesmas datas. Sem dados, apresentar ausência de registros em vez de progresso inventado.
- Cardio não tem tempo específico por exercício neste modelo de dados. Não utilizar duração da sessão como se fosse cardio. Registrar essa limitação; não criar integração fictícia.

Sem mudanças de esquema: reutilizar block_id, dias/horários, sessões e medições existentes. Validar responsividade, alternância de etapas e persistência com respostas de banco simuladas.

## Validação realizada

- 266 testes automatizados: inclui pesagens fora da etapa, etapa futura e frequência excluindo treinos de outros planos.
- Navegador com Supabase simulado: salvar treino e horário, falhar/repetir salvamento, recarregar dados, criar meta vinculada, vincular meta antiga, alternar etapas, conferir cargas 20→25 kg sem incluir sessão externa de 99 kg e pesagens 80→81 kg sem incluir medição futura de 99 kg.
- Temas claro/escuro e telas de 360/390 px. Semana usa o componente oficial com rolagem horizontal dentro da gaveta em telas estreitas; a página não transborda.
- Nenhuma gravação de teste no banco real; nenhuma migração necessária.
