import type { PermissionName, PermissionTerm } from '../permissionTerms';
export const namesPt: Readonly<Record<PermissionName, string>> = {
  Metadata: 'Metadados', Contents: 'Conteúdo', Secrets: 'Segredos', Variables: 'Variáveis', Issues: 'Questões', Actions: 'Ações', Checks: 'Verificações', Administration: 'Administração', Workflows: 'Fluxos de trabalho', 'Issue Types': 'Tipos de questão', Projects: 'Projetos', 'Pull requests': 'Pedidos de alteração', Members: 'Membros',
};
export const termsPt: Readonly<Record<PermissionTerm, string>> = {
  repository: 'repositório', organization: 'organização', read: 'Leitura', write: 'Escrita', required: 'Obrigatório', conditional: 'Condicional', verified: 'Verificado', missing: 'Em falta', unverifiable: 'Não verificável',
};
