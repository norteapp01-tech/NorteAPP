# Auditoria exploratória E2E — candidata a lançamento (18/10/2026)

Uso real do app no navegador (Chromium com agente de usuário de iPhone, 390 × 844; varreduras em
360, 430, 768 e 1280), contra o Supabase de produção com contas anônimas descartáveis. Todas as
contas e dados de teste foram apagados ao final (a exclusão de conta foi, ela mesma, testada pela
interface e confirmada no banco).

## O que foi usado de verdade

Introdução e "Começar agora"; Home (água, humor, lembretes, tarefas, modo claro e escuro); Agente
Norte por teclado (criar compromisso, mensagem ambígua, rede desligada, envio vazio); Agenda
(criar, editar, concluir, reabrir, duplicar, recorrência, dia/semana/mês/próximos, busca, rótulos,
filtros, duplo toque, Esc e foco no modal); Academia (criar treino, exercícios com músculo, escalar
na semana, treino completo pelo Alter e pelo modal: carga, repetições, drop, pular série, adicionar
série, descanso, finalizar, resumo, evolução); Esportes (gravar corrida com GPS simulado, pausar,
finalizar, salvar); Finanças (registrar por frase); Leitura (adicionar livro); Fé (novo registro);
Planos (criar plano); Alimentação (abas); Espelho (3 visões e períodos); Configurações (perfil,
preferências, notificações, privacidade, ajuda, exclusão de conta); login, erro de senha,
recuperação, cadastro (até a validação do formulário); isolamento entre usuários (leitura e escrita
cruzada pela API); rede lenta e offline; acessibilidade básica (nomes, rótulos, foco).

## Problemas encontrados e corrigidos

| # | Sev. | Onde | Passos | Esperado | Antes | Correção |
|---|---|---|---|---|---|---|
| 1 | **Grave** | Login / cadastro | Tocar em "Entrar com Apple" | Entrar, ou o botão nem aparecer | O navegador saía do app para uma página JSON de erro (`Unsupported provider`); o provedor Apple está desligado no Supabase | O app consulta quais provedores o projeto aceita e só mostra os ligados (`lib/supabase/providers.ts`) |
| 2 | **Grave** | Academia › Treinos cadastrados | Tocar na lixeira de um treino | Pedir confirmação | Apagava o treino na hora; alvo de 14 px, sem nome acessível | Confirmação "Manter / Excluir", alvo de 40 px e rótulo |
| 3 | Médio | Academia (Alter e modal) | Registrar série | Resposta imediata | 2–3 s; ~7 idas ao banco por série, descanso só começava depois | Id do exercício e índice da série vêm da memória, descanso e série saem juntos, recargas do mesmo instante dividem uma consulta (série 2 em diante ≈ 0,7 s) |
| 4 | Médio | Todo o app | Conexão que não responde | Erro claro | "Salvando…" para sempre (reproduzido ao salvar um livro) | Toda chamada ao Supabase tem prazo (30 s; arquivos e funções 120 s) e vira erro visível |
| 5 | Médio | Academia › Alter | Pular uma série e concluir | Contagem real | "4 séries registradas" quando 1 fora pulada | Mostra feitas e puladas separadamente |
| 6 | Médio | Espelho › Rotinas | Treinar e correr, abrir o Espelho | Aparecer o que foi feito | "Sem rotinas encerradas": treino, corrida e leitura têm tabelas próprias e não entravam | Novo bloco "Registrado nos módulos" (treinos, atividades, leitura) com comparação; só dados reais |
| 7 | Médio | Esportes | Gravar sem token de mapa | Mensagem de usuário | "token do Mapbox não configurado" (texto técnico) | Mensagem neutra; o bloqueio de ambiente segue (ver abaixo) |
| 8 | Médio | Tela de entrada | Errar a senha em tela baixa | Ver o erro | O aviso ficava no fim da folha, fora da vista | Rola até o aviso |
| 9 | Médio | Fé › Novo registro | Abrir e tocar em Salvar | Saber o que falta | "Salvar" apagado sem explicação | Dica "Escreva um título e o conteúdo para salvar" |
| 10 | Médio | Formulários na base da tela | Abrir "novo treino" / "exercício" | Botão visível | Botões ficavam atrás do dock fixo | `scroll-padding-bottom` global deixa folga para o dock |
| 11 | Refin. | Home | Abrir a Home | "18 de outubro" | "18 De Outubro" (CSS `capitalize`) | Usa o formato da Agenda |
| 12 | Refin. | Vários | Qualquer contagem igual a 1 | Singular | "1 treinos", "1 registros", "1 sessões", "0 de 1 compromissos"… | Helper `plural` aplicado nos pontos afetados |
| 13 | Refin. | Esportes, água, configurações | Ver distância e metas | Vírgula decimal | "0.16 km", "2.0 L" | `decimalBR` (pt-BR) e testes ajustados |
| 14 | Refin. | Agenda › Repetir | Abrir as opções | "Todo domingo" | "Toda domingo" | Concordância para sábado e domingo |
| 15 | Refin. | Agenda › Mais opções | Ler "Rígido" | Texto claro | "Não pode ser renegociado sem confronto" | "Horário fixo: o Norte não sugere mudá-lo" |
| 16 | Refin. | Finanças | "gastei 45,90 no mercado hoje" | "Mercado" | "Mercado hoje" | "hoje" sai da descrição |
| 17 | Refin. | Academia | Dia sem treino | Não repetir | "Dia de descanso" + "Hoje é dia de descanso." | "Nenhum treino programado para hoje." |
| 18 | Refin. | Acessibilidade | Leitor de tela / toque | Nomes e alvos de 44 px | Interruptores de notificação sem nome (40 × 24); botão "voltar" de /criar sem nome; chips de 28 px; setas e links de texto de 16–28 px | `role="switch"` + rótulos, alvos ampliados sem mudar o layout (`norte-hit`), chips de 40 px |
| 19 | Refin. | Lint | `eslint` | 0 erros | 56 erros de formatação (trabalho de outras sessões) | Prettier nos arquivos afetados |

## Bloqueios de ambiente (não são falhas do app)

- **Mapa (Mapbox):** não existe `VITE_MAPBOX_TOKEN` no `.env` nem no build publicado; a tela de
  gravação mostra "o mapa não está disponível". Precisa de um token público (`pk.…`) no build.
- **Google Agenda:** o início do OAuth funciona (redireciona ao Google com o `state` certo); a
  conclusão exige consentimento interativo com a conta de teste — **não foi testada**.
- **Cadastro por e-mail e recuperação de senha:** a confirmação de e-mail está ligada no Supabase;
  concluir exige caixa de entrada real. Foram testados o formulário e as validações, não o envio.
- **Apple:** provedor desligado no Supabase (botão agora escondido até ser ligado).
- **Não exercitado:** microfone, câmera/foto da refeição, notificações push reais, Safari/iOS de
  verdade, teclado aberto e áreas seguras do iPhone (o Chromium automatizado não reproduz).

## Recomendações de produto (não implementadas)

1. Canal de suporte: a Ajuda diz "o canal de atendimento ainda não foi disponibilizado".
2. Sem modo offline: recarregar sem rede mostra a página de erro do navegador (PWA/cache de casca).
3. O estado do treino recarrega **todo** o histórico a cada gravação; com meses de uso isso pesa.
4. Agente: respostas simples levam 10–15 s; mensagem ambígua ("marca isso") recriou um compromisso
   que já existia — vale um aviso de duplicidade antes de criar.
5. Só existe uma sessão por treino por dia: concluído por engano, não dá para refazer.
6. Entrada de horário nativa não obedece à preferência 12/24 h (depende do aparelho).
7. Plano sem etapas mostra "Criar ação" em dois cartões seguidos.
8. O parser de finanças não entende "ontem" (grava na data de hoje; a tela de confirmação permite corrigir).

Capturas em [`docs/auditoria-e2e/`](auditoria-e2e/).
