type LegalSection = { title: string; paragraphs?: string[]; bullets?: string[] };

const privacy: LegalSection[] = [
  {
    title: "1. Quem somos e alcance desta política",
    paragraphs: [
      "Norteapp, com operação no Brasil, é responsável pelo tratamento dos dados pessoais no aplicativo Norte. Para dúvidas, pedidos de privacidade ou exercício de direitos, escreva para Norteapp01@gmail.com.",
      "Esta política explica o tratamento de dados no aplicativo e nas páginas vinculadas a ele. Seu uso não transfere a propriedade das informações pessoais que você registra.",
    ],
  },
  {
    title: "2. Dados que você fornece",
    bullets: [
      "Conta: nome, e-mail, foto de perfil e identificadores fornecidos quando você escolhe entrar com Google ou Apple. A senha é tratada pelo serviço de autenticação; o Norte não precisa lê-la para oferecer a conta.",
      "Planejamento: objetivos, etapas, tarefas, compromissos, lembretes, hábitos e anotações.",
      "Rotinas pessoais: treinos, séries, cargas, medidas corporais, exercícios, corridas e outros esportes, refeições, metas nutricionais, leituras, notas, experiências de fé e registros de humor ou bem-estar que você decidir inserir.",
      "Finanças: despesas, receitas, metas, categorias e outros lançamentos que você registrar. O Norte não acessa suas contas bancárias por meio dessa função.",
      "Corridas e fotos: percurso e coordenadas de localização quando você autoriza o registro de uma atividade, além de fotos que optar por enviar.",
      "Assistente: mensagens, comandos de voz transcritos, contexto necessário para responder e o histórico recente da conversa armazenado neste dispositivo.",
      "Ideias para o Norte: sugestões de melhorias ou novidades que você decidir enviar, associadas à sua conta para organização do feedback.",
    ],
  },
  {
    title: "3. Dados sensíveis e informações de terceiros",
    paragraphs: [
      "Informações de saúde e medidas corporais, crenças religiosas e outros registros pessoais podem ser dados sensíveis conforme a LGPD. Você escolhe quais informações inserir. Elas são utilizadas para as funções que você solicitar; não são vendidas nem destinadas a anúncios personalizados.",
      "Você pode mencionar outras pessoas em notas ou compromissos. Registre apenas o necessário e respeite a privacidade delas. Essas informações permanecem associadas ao seu conteúdo, não são usadas para contatar terceiros.",
    ],
  },
  {
    title: "4. Dados técnicos e permissões",
    paragraphs: [
      "O aplicativo utiliza identificadores de sessão, armazenamento local, informações técnicas de acesso e registros necessários à segurança e ao funcionamento. A localização é solicitada para gravar trajetos; notificações dependem da sua permissão. Você pode alterar as permissões no dispositivo, embora algumas funções deixem de operar.",
      "O fuso horário escolhido fica no seu perfil. Algumas preferências visuais e uma gravação esportiva em andamento podem permanecer no dispositivo para continuar após uma interrupção.",
    ],
  },
  {
    title: "5. Para que usamos os dados e bases legais",
    paragraphs: [
      "Usamos seus dados para autenticar sua conta, guardar os registros que criar, montar planos e análises, enviar lembretes solicitados, responder no assistente, proteger o serviço e administrar sua assinatura. Os tratamentos necessários para prestar essas funções se apoiam na execução da relação contratual; segurança e prevenção de abuso podem se apoiar em legítimo interesse; obrigações legais podem exigir conservação de alguns registros. Quando a LGPD exigir consentimento para determinada finalidade ou dado sensível, ele deverá ser obtido de forma específica.",
      "Você pode deixar de registrar dados opcionais e remover conteúdo que já inseriu. A ausência de certas informações reduz a precisão de análises e recomendações.",
      "Quando você envia uma ideia, usamos o texto para avaliar possíveis melhorias do aplicativo. O envio não garante implementação nem resposta individual.",
    ],
  },
  {
    title: "6. Assistente de inteligência artificial",
    paragraphs: [
      "Para gerar respostas ou transcrever áudio, o conteúdo enviado e o contexto necessário à solicitação podem ser processados pela API da OpenAI. As respostas podem conter erros e não substituem orientação médica, nutricional, financeira, psicológica, jurídica ou de treinamento profissional.",
      "O Norte também mantém parte do histórico recente da conversa no armazenamento local do navegador. Não envie ao assistente senhas, números completos de cartão ou dados de terceiros que não sejam necessários.",
    ],
  },
  {
    title: "7. Com quem compartilhamos",
    paragraphs: [
      "Usamos a Supabase para autenticação, banco de dados, armazenamento de arquivos e notificações; a OpenAI para recursos de inteligência artificial; a Mapbox para mapas e rotas; e Google ou Apple somente quando você escolhe essas formas de entrada. Prestadores de hospedagem e comunicação podem receber dados técnicos necessários para operar o serviço. Provedores de pagamento e lojas tratam a cobrança segundo suas próprias políticas, quando houver contratação por esses canais.",
      "Esses fornecedores podem processar dados fora do Brasil, conforme a infraestrutura e as regras aplicáveis. O Norte não comercializa seus registros pessoais.",
    ],
  },
  {
    title: "8. Proteção, arquivos e tempo de guarda",
    paragraphs: [
      "Os registros da conta são protegidos por autenticação e controles de acesso no banco de dados. Nenhum sistema é livre de riscos. Atualmente, imagens de perfil, atividades, capas de livro enviadas e imagens de metas financeiras podem ser acessadas por quem possua seu link público; não envie fotos que precise manter estritamente privadas até que esse armazenamento seja alterado.",
      "Em regra, o conteúdo é mantido enquanto a conta existir ou até você apagá-lo ou resetá-la. Dados de cobrança, segurança, auditoria e cópias de segurança podem ser conservados pelo período necessário para obrigação legal, prevenção a fraude ou exercício de direitos. O prazo efetivo também pode depender dos prestadores envolvidos; não prometemos eliminação instantânea de cópias de segurança.",
    ],
  },
  {
    title: "9. Suas escolhas e direitos",
    paragraphs: [
      "Você pode alterar dados do perfil, resetar o conteúdo mantendo o login ou pedir a exclusão permanente em Configurações. Reset e exclusão são irreversíveis para o conteúdo do aplicativo; a assinatura deve ser cancelada separadamente no canal de contratação.",
      "Pelo e-mail Norteapp01@gmail.com você pode solicitar confirmação do tratamento, acesso, correção, eliminação quando cabível, informação sobre compartilhamento, portabilidade nos termos legais e revisão de decisões exclusivamente automatizadas que afetem seus interesses. Também pode levar uma reclamação à ANPD. Podemos pedir confirmação da sua identidade antes de atender o pedido.",
    ],
  },
  {
    title: "10. Atualizações e contato",
    paragraphs: [
      "Esta política pode ser atualizada para refletir mudanças no Norte, nos fornecedores ou na legislação. Alterações relevantes serão comunicadas no aplicativo ou por outro meio adequado. Contato: Norteapp01@gmail.com.",
    ],
  },
];

const terms: LegalSection[] = [
  {
    title: "1. O serviço",
    paragraphs: [
      "O Norte é um aplicativo de organização pessoal oferecido por Norteapp, com operação no Brasil. Ele reúne planejamento, agenda, lembretes, alimentação, academia, esportes, leitura, finanças pessoais, fé, registros de bem-estar e um assistente de inteligência artificial. Alguns recursos dependem de conexão, permissões do dispositivo ou assinatura.",
      "Ao usar o aplicativo, você concorda com estes Termos e deve consultar também a Política de Privacidade. Se discordar, deixe de usar o serviço e solicite a exclusão da conta, se desejar.",
    ],
  },
  {
    title: "2. Conta e acesso",
    paragraphs: [
      "Você é responsável por fornecer dados corretos, proteger suas credenciais e manter o controle do dispositivo. A experiência pode começar com sessão de demonstração ou anônima; para recuperar registros em outro aparelho, vincule uma forma de acesso à conta.",
      "O login por Google ou Apple depende desses provedores. O Norte pode limitar acessos suspeitos para proteger contas e o serviço, observados os direitos do usuário.",
    ],
  },
  {
    title: "3. Seus registros e conduta",
    paragraphs: [
      "O conteúdo que você registrar continua sendo seu. Você nos autoriza a armazená-lo e processá-lo apenas na medida necessária para as funções solicitadas e conforme a Política de Privacidade. Não registre dados de terceiros sem base adequada, não use o serviço para atividades ilícitas e não tente acessar contas ou dados de outras pessoas.",
      "O Norte pode restringir usos abusivos ou que comprometam a segurança, com comunicação adequada quando possível. Você pode apagar registros, resetar os dados ou excluir a conta em Configurações.",
    ],
  },
  {
    title: "4. Informações e limites das análises",
    paragraphs: [
      "Gráficos, metas, estimativas de esforço, recomendações e respostas do assistente são ferramentas informativas. Podem estar incompletos ou incorretos, especialmente se os registros fornecidos forem imprecisos. Não são diagnóstico nem orientação profissional de saúde, nutrição, exercício, finanças ou direito.",
      "Treinos e esportes envolvem riscos físicos; respeite seus limites e procure profissionais habilitados quando necessário. A gravação por GPS depende do aparelho, das permissões e das condições de sinal; trajetos e distâncias podem variar.",
    ],
  },
  {
    title: "5. Planos e pagamentos",
    paragraphs: [
      "Recursos gratuitos e pagos, preços, duração, renovação e eventuais testes são apresentados antes da contratação no canal de compra. A disponibilidade de planos pode mudar. Compras realizadas por lojas de aplicativos ou outro provedor também seguem as regras de cobrança, cancelamento e reembolso desse canal, sem afastar os direitos previstos na legislação brasileira.",
      "Excluir ou resetar a conta não cancela automaticamente uma assinatura externa. Antes de excluir, verifique e cancele a renovação no local em que contratou. Se houver dificuldade, contate Norteapp01@gmail.com.",
    ],
  },
  {
    title: "6. Disponibilidade e alterações",
    paragraphs: [
      "Trabalhamos para manter o Norte acessível e seguro, mas podem ocorrer manutenção, falhas de rede, indisponibilidade de fornecedores e mudanças em recursos. Não garantimos funcionamento ininterrupto nem resultado específico a partir dos registros ou sugestões do aplicativo.",
      "Podemos atualizar estes Termos e comunicar alterações relevantes com antecedência razoável. A continuidade do uso após a entrada em vigor da versão atualizada indica aceitação, sem prejuízo dos direitos legais do consumidor.",
    ],
  },
  {
    title: "7. Encerramento e contato",
    paragraphs: [
      "Você pode deixar de usar o Norte, resetar o conteúdo ou solicitar a exclusão da conta em Configurações. A exclusão remove o acesso e os dados associados, ressalvados registros que devam ser conservados por obrigação legal ou exercício de direitos, conforme a Política de Privacidade.",
      "Estes Termos são interpretados conforme as leis brasileiras, preservados os direitos do consumidor e as regras de competência aplicáveis. Para suporte ou dúvidas, escreva para Norteapp01@gmail.com.",
    ],
  },
];

export function LegalDocument({ kind }: { kind: "privacy" | "terms" }) {
  const isPrivacy = kind === "privacy";
  return (
    <article className="space-y-6 pb-8 text-sm leading-relaxed text-foreground">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Norteapp · Brasil</p>
        <h2 className="text-2xl font-bold tracking-tight">
          {isPrivacy ? "Política de Privacidade" : "Termos de Uso"}
        </h2>
        <p className="text-xs text-muted-foreground">Última atualização: 22 de setembro de 2026</p>
      </header>
      {(isPrivacy ? privacy : terms).map((section) => (
        <section key={section.title} className="space-y-2 border-t border-border pt-5">
          <h3 className="text-base font-semibold">{section.title}</h3>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="text-muted-foreground">
              {paragraph}
            </p>
          ))}
          {section.bullets && (
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
              {section.bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <a
        href="mailto:Norteapp01@gmail.com"
        className="inline-block text-primary underline underline-offset-4"
      >
        Norteapp01@gmail.com
      </a>
    </article>
  );
}

export function PrivacyPolicy() {
  return <LegalDocument kind="privacy" />;
}
export function TermsOfUse() {
  return <LegalDocument kind="terms" />;
}
