import type { SetupQuestion } from '../../domain/setup_questionnaire';
import type { SetupQuestionExplanation } from '../contracts/web_setup_view';
import { translatedQuestionLabel } from './setup_question_labels_fr_pt';
import { setupQuestionPurposeFrPt } from './setup_question_purpose_fr_pt';

type Copy = Pick<SetupQuestionExplanation, 'summary' | 'when' | 'example' | 'effect' | 'verify'>;

const where: Readonly<Record<SetupQuestion['stateId'], string>> = {
  capabilities: 'A configuração escreve os fluxos escolhidos neste repositório e pede apenas as permissões GitHub necessárias.',
  'agent-runtime': 'Os fluxos GitHub Actions gerados executam este agente no respetivo runner; nada é instalado neste computador.',
  'agent-model-defaults': 'O modelo e o comando comuns são guardados na configuração do repositório usada pelos fluxos gerados.',
  'agent-role-overrides': 'Esta exceção para uma tarefa é guardada no repositório e lida apenas quando essa tarefa é executada.',
  repository: 'O perfil do repositório e os fluxos gerados usam este valor em futuros eventos de ramos, questões e pull requests.',
  deployment: 'O perfil do repositório controla futuros fluxos de release e hotfix; responder não publica nada.',
  bugbot: 'O fluxo gerado lê esta definição da configuração ou das Variables do GitHub Actions selecionadas.',
  'pull-request-approval': 'A aprovação protegida usa identidades exatas dos produtores CI e provas das execuções de pull requests no GitHub.',
  projects: 'Os Projects escolhidos e os valores do campo Status serão usados pela futura automatização de questões e pull requests.',
  provisioning: 'Após a confirmação final, a configuração pode criar ou atualizar os ficheiros e recursos do GitHub Actions escolhidos.',
  storage: 'O GitHub Actions guarda estes recursos no repositório ou na organização; o âmbito altera a visibilidade e as permissões do PAT.',
};

const section: Readonly<Record<SetupQuestion['stateId'], Copy>> = {
  capabilities: { summary: 'Escolha as automatizações que o Copilot irá instalar.', when: 'Isto afeta os fluxos, as permissões GitHub e as perguntas seguintes.', example: 'Desative uma função que não pretende utilizar.', effect: 'Só as funções selecionadas entram no plano.', verify: 'Reveja o plano antes de aplicar alterações.' },
  'agent-runtime': { summary: 'Escolha o agente CLI para esta tarefa.', when: 'Aplica-se quando a função selecionada é executada no GitHub Actions.', example: 'O Codex é executado através do comando codex.', effect: 'A Action executa o fornecedor escolhido, sem substituição implícita.', verify: 'Confirme que o runner tem o CLI e as credenciais necessárias.' },
  'agent-model-defaults': { summary: 'Defina os modelos predefinidos comuns às tarefas do agente.', when: 'Usam-se salvo se configurar cada tarefa separadamente.', example: 'Mantenha o modelo sugerido se não tiver uma necessidade específica.', effect: 'A Action passa estes valores ao CLI escolhido.', verify: 'Reveja o plano e os modelos permitidos no runner.' },
  'agent-role-overrides': { summary: 'Personalize esta tarefa do agente.', when: 'Apenas se tiver ativado a configuração independente por tarefa.', example: 'Use um modelo diferente para revisão e planeamento.', effect: 'A exceção só se aplica a esta tarefa.', verify: 'Reveja os valores de cada tarefa no plano.' },
  repository: { summary: 'Defina como o Copilot trata o seu repositório.', when: 'Aplica-se aos fluxos gerados e a futuros eventos de questões ou pull requests.', example: 'Indique o nome real do ramo de desenvolvimento.', effect: 'A futura automatização segue os ramos e as regras escolhidos.', verify: 'Reveja os ficheiros planeados e o perfil do repositório.' },
  deployment: { summary: 'Defina o comportamento de releases e hotfixes.', when: 'Só importa se esses fluxos estiverem ativados.', example: 'Mantenha a estratégia predefinida salvo se a política de ramos for diferente.', effect: 'Altera a gestão de ramos e pull requests de reconciliação.', verify: 'Reveja a secção de releases e hotfixes do plano.' },
  bugbot: { summary: 'Defina como o Bugbot analisa e comunica alterações.', when: 'Usa-se quando as funções de revisão por IA são executadas.', example: 'Por predefinição, publica resultados elegíveis sem bloquear todas as pull requests.', effect: 'Altera futuras publicações e diagnósticos de revisão.', verify: 'Reveja as Variables do Bugbot no plano e os resultados posteriores.' },
  'pull-request-approval': { summary: 'Escolha as provas exigidas antes de o bot recomendar ou submeter uma aprovação.', when: 'Só se aplica se a automatização de pull requests estiver ativa.', example: '«Recommend» informa uma pessoa; «guarded» pode aprovar no GitHub.', effect: 'Uma verificação verde nesta página nunca aprova uma pull request por si só.', verify: 'Inspecione as provas CI, o Bugbot e as regras de ramos.' },
  projects: { summary: 'Escolha um valor Status existente para uma transição de questão ou PR.', when: 'Apenas se integrar Projects.', example: 'Todo na criação; In Progress no início do trabalho.', effect: 'A automatização atualiza o campo Status, não uma coluna visual.', verify: 'Verifique as opções Status de cada Project escolhido.' },
  provisioning: { summary: 'Escolha os recursos do GitHub Actions geridos pela configuração.', when: 'Isto afeta as permissões do PAT e as alterações previstas.', example: 'Mantenha os Secrets ativos se for necessário instalar o PAT do bot.', effect: 'Os recursos selecionados poderão ser criados ou atualizados após aprovação.', verify: 'Reveja os nomes exatos dos recursos no plano.' },
  storage: { summary: 'Escolha onde ficam as Variables e Secrets do GitHub Actions.', when: 'Aplica-se quando a sua criação está ativa.', example: 'O âmbito do repositório é a opção predefinida mais simples.', effect: 'Altera visibilidade, permissões e precedência.', verify: 'Confirme o âmbito e os avisos de sobreposição no plano.' },
};

const special: Readonly<Record<string, Copy>> = {
  'agents.findings.executable': { summary: 'Escolha o comando do agente no runner GitHub Actions, não neste computador.', when: 'Altere-o apenas se tiver instalado deliberadamente outro agente no runner.', example: 'Deixe vazio para codex, opencode ou agent, conforme o fornecedor.', effect: 'O caminho personalizado é usado pelas tarefas escolhidas e nunca é instalado automaticamente.', verify: 'Confirme que o runner tem exatamente este executável antes de ativar o fluxo.' },
  'ai.includeReasoning': { summary: 'Peça explicações adicionais se a resposta do fornecedor as disponibilizar.', when: 'Só para diagnóstico avançado; o percurso CLI atual não fornece partes de raciocínio separadas.', example: 'Mantenha desativado numa configuração normal.', effect: 'Pode acrescentar texto do fornecedor, sem garantir metadados breves.', verify: 'Inspecione uma resposta estruturada controlada; não presuma que a opção produziu texto adicional.' },
  'ai.bugbotDryRun': { summary: 'Mantenha o Bugbot em modo apenas de análise nas próximas execuções.', when: 'Útil numa avaliação; incompatível com provas de aprovação.', example: 'Escolha Não para publicar revisões normais.', effect: 'O Bugbot analisa sem publicar resultados nem alterar o repositório. Não é setup --dry-run.', verify: 'Inspecione o resultado do fluxo Bugbot: a simulação não publica revisão nem verificação.' },
  'ai.bugbotOrganizationRules': { summary: 'Defina instruções gerais para o Bugbot, uma regra por linha.', when: 'Use se a equipa precisar de critérios de revisão partilhados no repositório configurado.', example: 'Assinalar alterações que contornem o isolamento entre clientes.', effect: 'Estas regras precedem as do repositório; o âmbito da Variable determina o armazenamento.', verify: 'Inspecione a Variable configurada e ative o rastreio das fontes das regras.' },
  'ai.provisioningMode': { summary: 'Decida como a Action encontra ou instala o agente CLI.', when: 'Aplica-se no runner quando começa uma tarefa de IA ativa.', example: 'Auto reutiliza um CLI instalado ou instala uma versão fixa de Codex/OpenCode.', effect: 'Always reinstala as versões revistas; Disabled exige um CLI pré-instalado. Cursor tem de estar pré-instalado.', verify: 'Inspecione a etapa de preparação e a versão do binário comunicada pelo runner.' },
  'pullRequestApproval.testChecks': { summary: 'Escolha os jobs CI que o bot pode aceitar como prova independente de testes.', when: 'Obrigatório para os modos Recommend e Guarded.', example: 'Selecione o job Tests exato, o ID da App GitHub e o workflow de uma execução recente.', effect: 'Só as identidades exatas listadas satisfazem a condição de aprovação.', verify: 'Abra a execução associada e confirme job, App e resultado do commit atual.' },
  'pullRequestApproval.producerAttested': { summary: 'Confirme que inspecionou o produtor CI exato e a sua etapa obrigatória de cobertura.', when: 'Obrigatório antes de o modo Guarded poder aprovar.', example: 'Confirme que o job Tests falha se o limite de cobertura não for atingido.', effect: 'A sua confirmação fica registada; o Copilot não a deduz de uma verificação verde.', verify: 'Inspecione o ficheiro do workflow e uma execução real antes de escolher Sim.' },
  'pullRequestApproval.coverage.mode': { summary: 'Escolha como comprovar a cobertura exigida do código alterado.', when: 'Aplica-se quando a aprovação de PR está ativa.', example: 'Check: o CI exige o limite. Numeric: um workflow fiável publica contagens limitadas.', effect: 'Check confia numa condição CI; Numeric lê copilot-diff-coverage-v1 e compara o limite.', verify: 'Inspecione, respetivamente, a condição de falha CI ou o artefacto do relatório.' },
  'pullRequestApproval.coverage.checkName': { summary: 'Selecione a verificação fiável que falha abaixo do limite de cobertura.', when: 'Obrigatório nos dois modos de prova.', example: 'Use o mesmo job Tests exato da etapa anterior.', effect: 'O sucesso de outra verificação ou App não substitui esta condição.', verify: 'Confirme que a etapa de cobertura é obrigatória e não apenas informativa.' },
  'projects.enabled': { summary: 'Decida se futuras questões e PR devem usar Projects GitHub existentes.', when: 'Antes de criar o PAT de configuração para prever o acesso de leitura a Projects.', example: 'Sim se a equipa usa um Project da organização; Não para ignorar.', effect: 'Sim inclui Projects: read da organização quando necessário. Nenhum Project é alterado agora.', verify: 'Reveja as permissões do PAT; escolherá os Projects concretos depois de o autorizar.' },
  'projects.ids': { summary: 'Selecione os Projects existentes que o Copilot poderá atualizar futuramente.', when: 'Após verificar o PAT; se a lista não estiver disponível, introduza os dados manualmente.', example: 'Para https://github.com/orgs/acme/projects/5, marque o cartão ou introduza 5, nunca PVT_…', effect: 'Os números ficam guardados; nenhum item de Project é alterado agora.', verify: 'Abra cada Project e confirme proprietário e número antes de aprovar o plano.' },
};

function howToChoose(question: SetupQuestion): string {
  if (question.id === 'pullRequestApproval.coverage.checkName') return 'Escolha uma das verificações fiáveis acima. Abra a execução e o workflow: o passo de cobertura tem de fazer falhar o job quando o limite não é atingido. Um resultado verde não basta.';
  if (question.id === 'pullRequestApproval.producerAttested') return 'Responda Sim apenas depois de verificar cada nome, ID da App e workflow escolhido, bem como o passo obrigatório de cobertura do check selecionado. Caso contrário, responda Não e mantenha o modo de recomendação.';
  if (question.id === 'pullRequestApproval.coverage.artifactWorkflowName') return 'Introduza o nome exato de um workflow fiável selecionado que publique copilot-diff-coverage-v1 para este PR e os seus commits base e head. Não adivinhe o nome do workflow.';
  if (question.id === 'projects.statusVerified') return 'Abra cada Project escolhido no GitHub, inspecione o campo Status e compare os quatro valores exatos acima. Responda Sim apenas se todos existirem em cada Project; Não regressa à seleção de Projects.';
  if (/^projects\.(issue|pullRequest)(Created|InProgress)Column$/u.test(question.id)) return 'Escolha uma opção do campo Status presente em todos os Projects selecionados. Se não conseguir consultar as opções, abra cada Project no GitHub e introduza o mesmo valor existente; valores diferentes por Project não são suportados.';
  switch (question.kind) {
    case 'boolean': return 'Escolha Sim para ativar ou Não para desativar; a resposta sugerida aparece abaixo.';
    case 'producer-select': return 'Inspecione cada execução candidata no GitHub e escolha o job, ID da App e workflow exatos. Introduza manualmente apenas se não houver candidato verificado.';
    case 'project-select': return 'Selecione pelo título e URL. Se faltar um Project, introduza o número positivo ou URL exato do GitHub; IDs PVT_ não são válidos.';
    case 'scope-overrides': return 'Selecione apenas os nomes herdados que pretende substituir no repositório. Deixe vazio para conservar os valores da organização.';
    case 'multi-select': return 'Assinale os fluxos que pretende usar. Pode escolher vários; reveja as permissões antes de criar um PAT.';
    case 'choice': return 'Escolha um valor após ler as consequências; o valor guardado não é traduzido.';
    case 'number': return 'Introduza um número inteiro no intervalo indicado; mantenha o valor sugerido se tiver dúvidas.';
    default: return 'Introduza o valor exato usado pelo repositório ou runner; deixe vazio apenas se a pergunta o permitir.';
  }
}

export function portugueseQuestionExplanation(question: SetupQuestion, documentation: SetupQuestionExplanation['documentation']): SetupQuestionExplanation {
  const copy = special[question.id] ?? section[question.stateId];
  return {
    label: translatedQuestionLabel(question, 'pt'),
    ...copy,
    summary: special[question.id] ? copy.summary : (setupQuestionPurposeFrPt(question, 'pt') ?? copy.summary),
    where: where[question.stateId],
    how: howToChoose(question),
    why: `Esta decisão permite alinhar o plano, as permissões do PAT e a futura automatização antes de aplicar alterações. ${copy.when}`,
    documentation: { title: 'Documentação desta opção', url: documentation.url },
  };
}
