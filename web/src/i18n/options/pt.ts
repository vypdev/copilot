import type { optionLabelsEs } from './es';

export const optionLabelsPt: Record<keyof typeof optionLabelsEs, string> = {
  All: 'Todos', prompt: 'Perguntar antes de criar o apontador', 'create-if-missing': 'Criar o apontador se faltar', disabled: 'Desativado',
  replace: 'Substituir', append: 'Acrescentar', preserve: 'Conservar',
  info: 'Informação', low: 'Baixa', medium: 'Média', high: 'Alta',
  smart: 'Adaptativo', default: 'Predefinido', auto: 'Automático', always: 'Reinstalar sempre',
  recommend: 'Recomendar aprovação', guarded: 'Aprovar sob condições', off: 'Desativado',
  check: 'Verificação CI que exige cobertura', numeric: 'Relatório numérico verificável',
  repository: 'Repositório', organization: 'Organização', selected: 'Repositórios selecionados', private: 'Repositórios privados', all: 'Todos os repositórios',
  'production-lineage': 'Preservar a linhagem de produção', 'canonical-gitflow': 'Git-Flow canónico', manual: 'Manual',
  'auto-merge': 'Integrar automaticamente', 'merge-queue': 'Fila de integração', 'create-only': 'Criar apenas a PR',
  direct: 'Integração direta', 'sync-branch': 'Através de ramo de sincronização', 'prefer-release': 'Priorizar a release', development: 'Desenvolvimento', both: 'Ambos os destinos',
  'source-only': 'Apenas ramo de origem', 'sync-only': 'Apenas ramo de sincronização', none: 'Nenhum',
  close: 'Fechar a questão', 'keep-open': 'Manter aberta', guided: 'Guiado', compact: 'Compacto', quiet: 'Mínimo',
  update: 'Atualizar o comentário', milestones: 'Publicar nos marcos',
  feature: 'Funcionalidade', bugfix: 'Correção', documentation: 'Documentação', chore: 'Manutenção', help: 'Ajuda ou pergunta', hotfix: 'Hotfix', release: 'Release',
};
