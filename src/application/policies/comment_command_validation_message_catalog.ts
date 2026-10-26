import type { CopilotCommandValidationReason } from '../../domain/copilot_command_validation';

type CommandValidationContent = Readonly<Record<CopilotCommandValidationReason, Readonly<{
  impact: string; action: string; retainedState: string;
}>>>;

export const ENGLISH_COMMAND_VALIDATION_CONTENT: CommandValidationContent = Object.freeze({
  'comment-command-length': Object.freeze({
    impact: "The complete command exceeds the 2,000-character limit.",
    action: "Shorten the command to at most 2,000 characters, including its prefix and arguments. Put explanations in a separate comment. Example: {commandExample}. Command help: {commandHelp}.",
    retainedState: "No command action ran. Existing files, branches and reviews were preserved.",
  }),
  'comment-command-name-missing': Object.freeze({
    impact: "The {commandPrefix} prefix is missing a command name.",
    action: "Choose a supported command from help. Example: {commandExample}. Command help: {commandHelp}.",
    retainedState: "No command action ran. Existing files, branches and reviews were preserved.",
  }),
  'comment-command-name-unknown': Object.freeze({
    impact: "The command name is not supported.",
    action: "Choose a supported command from help; do not append a new command name to the rejected input. Example: {commandExample}. Command help: {commandHelp}.",
    retainedState: "No command action ran. Existing files, branches and reviews were preserved.",
  }),
  'comment-command-argument-count': Object.freeze({
    impact: "The command exceeds the limit of 20 arguments.",
    action: "Remove extra arguments and send explanations in a separate comment. Finding IDs in valid double quotes count as one argument. Example: {commandExample}. Command help: {commandHelp}.",
    retainedState: "No command action ran. Existing files, branches and reviews were preserved.",
  }),
  'comment-command-arguments-unexpected': Object.freeze({
    impact: "This command accepts no arguments.",
    action: "Send the command alone. Put explanations in a separate comment. Example: {commandExample}. Command help: {commandHelp}.",
    retainedState: "No command action ran. Existing files, branches and reviews were preserved.",
  }),
  'comment-command-arguments-missing': Object.freeze({
    impact: "This command requires at least one argument.",
    action: "Replace the angle-bracket placeholder in the example with the intended finding ID, request or rule before sending it. Example: {commandExample}. Command help: {commandHelp}.",
    retainedState: "No command action ran. Existing files, branches and reviews were preserved.",
  }),
  'comment-command-finding-quoting': Object.freeze({
    impact: "A finding ID is not validly double-quoted or contains an empty value or newline.",
    action: "Copy the complete finding ID from the review. Use valid JSON double quotes for IDs with spaces; escape quotes and backslashes. Replace the example ID before sending. Example: {commandExample}. Command help: {commandHelp}.",
    retainedState: "No command action ran. Existing files, branches and reviews were preserved.",
  }),
  'comment-command-review-format': Object.freeze({
    impact: "Review commands accept only key=value options, not trailing prose.",
    action: "Use effort=low, effort=default, effort=high or effort=smart. Boolean options dry-run, trace-rules and suggested-changes accept true or false. Put explanations in a separate comment. Example: {commandExample}. Command help: {commandHelp}.",
    retainedState: "No command action ran. Existing files, branches and reviews were preserved.",
  }),
  'comment-command-review-effort': Object.freeze({
    impact: "The review effort value is not supported.",
    action: "Choose exactly one of effort=low, effort=default, effort=high or effort=smart. Example: {commandExample}. Command help: {commandHelp}.",
    retainedState: "No command action ran. Existing files, branches and reviews were preserved.",
  }),
  'comment-command-review-boolean': Object.freeze({
    impact: "A boolean review option has an invalid value.",
    action: "Use exactly true or false for dry-run, trace-rules and suggested-changes. Example: {commandExample}. Command help: {commandHelp}.",
    retainedState: "No command action ran. Existing files, branches and reviews were preserved.",
  }),
  'comment-command-review-option': Object.freeze({
    impact: "The review option name is not supported.",
    action: "Use only effort, dry-run, trace-rules and suggested-changes, each as key=value. Example: {commandExample}. Command help: {commandHelp}.",
    retainedState: "No command action ran. Existing files, branches and reviews were preserved.",
  }),
  'comment-command-sync-option': Object.freeze({
    impact: "The branch synchronization option is not supported.",
    action: "Use only these options: {syncOptions}. Replace the parent placeholder if used. Example: {commandExample}. Command help: {commandHelp}.",
    retainedState: "No command action ran. Existing files, branches and reviews were preserved.",
  }),
  'comment-command-sync-parent': Object.freeze({
    impact: "The --from option is missing a parent branch name.",
    action: "Supply a valid parent branch after --from, or remove the override to use the configured parent. The example previews the configured synchronization. Example: {commandExample}. Command help: {commandHelp}.",
    retainedState: "No command action ran. Existing files, branches and reviews were preserved.",
  }),
});

export const SPANISH_COMMAND_VALIDATION_CONTENT: CommandValidationContent = Object.freeze({
  'comment-command-length': Object.freeze({
    impact: "El comando completo supera el límite de 2.000 caracteres.",
    action: "Reduce el comando a un máximo de 2.000 caracteres, incluidos el prefijo y los argumentos. Escribe las explicaciones en otro comentario. Ejemplo: {commandExample}. Ayuda de comandos: {commandHelp}.",
    retainedState: "No se ejecutó ninguna acción del comando. Se conservaron los archivos, las ramas y las revisiones existentes.",
  }),
  'comment-command-name-missing': Object.freeze({
    impact: "Al prefijo {commandPrefix} le falta el nombre del comando.",
    action: "Elige un comando compatible en la ayuda. Ejemplo: {commandExample}. Ayuda de comandos: {commandHelp}.",
    retainedState: "No se ejecutó ninguna acción del comando. Se conservaron los archivos, las ramas y las revisiones existentes.",
  }),
  'comment-command-name-unknown': Object.freeze({
    impact: "El nombre del comando no es compatible.",
    action: "Elige un comando compatible en la ayuda; no añadas otro nombre de comando al texto rechazado. Ejemplo: {commandExample}. Ayuda de comandos: {commandHelp}.",
    retainedState: "No se ejecutó ninguna acción del comando. Se conservaron los archivos, las ramas y las revisiones existentes.",
  }),
  'comment-command-argument-count': Object.freeze({
    impact: "El comando supera el límite de 20 argumentos.",
    action: "Retira los argumentos sobrantes y envía las explicaciones en otro comentario. Cada identificador entre comillas dobles válidas cuenta como un argumento. Ejemplo: {commandExample}. Ayuda de comandos: {commandHelp}.",
    retainedState: "No se ejecutó ninguna acción del comando. Se conservaron los archivos, las ramas y las revisiones existentes.",
  }),
  'comment-command-arguments-unexpected': Object.freeze({
    impact: "Este comando no acepta argumentos.",
    action: "Envía solo el comando. Escribe las explicaciones en otro comentario. Ejemplo: {commandExample}. Ayuda de comandos: {commandHelp}.",
    retainedState: "No se ejecutó ninguna acción del comando. Se conservaron los archivos, las ramas y las revisiones existentes.",
  }),
  'comment-command-arguments-missing': Object.freeze({
    impact: "Este comando requiere al menos un argumento.",
    action: "Sustituye el marcador entre corchetes angulares del ejemplo por el identificador, la petición o la regla antes de enviarlo. Ejemplo: {commandExample}. Ayuda de comandos: {commandHelp}.",
    retainedState: "No se ejecutó ninguna acción del comando. Se conservaron los archivos, las ramas y las revisiones existentes.",
  }),
  'comment-command-finding-quoting': Object.freeze({
    impact: "Un identificador no tiene comillas dobles válidas o contiene un valor vacío o un salto de línea.",
    action: "Copia el identificador completo de la revisión. Usa comillas dobles JSON válidas si contiene espacios; escapa comillas y barras inversas. Sustituye el identificador del ejemplo antes de enviarlo. Ejemplo: {commandExample}. Ayuda de comandos: {commandHelp}.",
    retainedState: "No se ejecutó ninguna acción del comando. Se conservaron los archivos, las ramas y las revisiones existentes.",
  }),
  'comment-command-review-format': Object.freeze({
    impact: "Los comandos de revisión solo aceptan opciones clave=valor, sin texto libre adicional.",
    action: "Usa effort=low, effort=default, effort=high o effort=smart. Las opciones booleanas dry-run, trace-rules y suggested-changes aceptan true o false. Escribe las explicaciones en otro comentario. Ejemplo: {commandExample}. Ayuda de comandos: {commandHelp}.",
    retainedState: "No se ejecutó ninguna acción del comando. Se conservaron los archivos, las ramas y las revisiones existentes.",
  }),
  'comment-command-review-effort': Object.freeze({
    impact: "El valor de esfuerzo de revisión no es compatible.",
    action: "Elige uno de estos valores: effort=low, effort=default, effort=high o effort=smart. Ejemplo: {commandExample}. Ayuda de comandos: {commandHelp}.",
    retainedState: "No se ejecutó ninguna acción del comando. Se conservaron los archivos, las ramas y las revisiones existentes.",
  }),
  'comment-command-review-boolean': Object.freeze({
    impact: "Una opción booleana de revisión tiene un valor no válido.",
    action: "Usa exactamente true o false para dry-run, trace-rules y suggested-changes. Ejemplo: {commandExample}. Ayuda de comandos: {commandHelp}.",
    retainedState: "No se ejecutó ninguna acción del comando. Se conservaron los archivos, las ramas y las revisiones existentes.",
  }),
  'comment-command-review-option': Object.freeze({
    impact: "El nombre de la opción de revisión no es compatible.",
    action: "Usa solo effort, dry-run, trace-rules y suggested-changes, con el formato clave=valor. Ejemplo: {commandExample}. Ayuda de comandos: {commandHelp}.",
    retainedState: "No se ejecutó ninguna acción del comando. Se conservaron los archivos, las ramas y las revisiones existentes.",
  }),
  'comment-command-sync-option': Object.freeze({
    impact: "La opción de sincronización de rama no es compatible.",
    action: "Usa solo estas opciones: {syncOptions}. Sustituye el marcador de rama padre si lo usas. Ejemplo: {commandExample}. Ayuda de comandos: {commandHelp}.",
    retainedState: "No se ejecutó ninguna acción del comando. Se conservaron los archivos, las ramas y las revisiones existentes.",
  }),
  'comment-command-sync-parent': Object.freeze({
    impact: "A la opción --from le falta el nombre de la rama padre.",
    action: "Indica una rama padre válida después de --from o retira la opción para usar la rama configurada. El ejemplo previsualiza la sincronización configurada. Ejemplo: {commandExample}. Ayuda de comandos: {commandHelp}.",
    retainedState: "No se ejecutó ninguna acción del comando. Se conservaron los archivos, las ramas y las revisiones existentes.",
  }),
});
