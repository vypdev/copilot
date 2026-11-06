import type { ReviewCopy } from './center_review.ts';
import { deepFreeze } from './value.ts';

const copies: Readonly<Record<string, ReviewCopy>> = deepFreeze({
    en: { states: {
        preview: 'Review this change before saving.', committing: 'Saving the reviewed change…', saved: 'The change is saved.',
        unknown: 'We could not confirm whether the change was saved. Read the current settings before doing anything else.',
        conflict: 'Settings changed in another window. Read the latest version and review again.',
        stale: 'This window is no longer current. Read the latest settings before reviewing again.',
        cancelled: 'No changes were made.', unavailable: 'Settings are unavailable. Read them again before trying to save.' },
        confirm: 'Confirm change', cancel: 'Cancel change', dismiss: 'Close review', reload: 'Read current settings',
        before: 'Before', after: 'After', effects: 'Changes to review', details: 'Technical details',
        revision: 'Reviewed settings revision', observer: 'Read-only. Take control of editing before confirming a change.' },
    es: { states: {
        preview: 'Revisa este cambio antes de guardarlo.', committing: 'Guardando el cambio revisado…', saved: 'El cambio está guardado.',
        unknown: 'No se ha podido confirmar si el cambio se guardó. Consulta la configuración actual antes de continuar.',
        conflict: 'La configuración ha cambiado en otra ventana. Consulta la última versión y revísala de nuevo.',
        stale: 'Esta ventana ya no está actualizada. Consulta la configuración actual antes de volver a revisarla.',
        cancelled: 'No se ha realizado ningún cambio.', unavailable: 'La configuración no está disponible. Consúltala de nuevo antes de intentar guardar.' },
        confirm: 'Confirmar cambio', cancel: 'Cancelar cambio', dismiss: 'Cerrar revisión', reload: 'Consultar configuración actual',
        before: 'Antes', after: 'Después', effects: 'Cambios que se van a aplicar', details: 'Detalles técnicos',
        revision: 'Revisión de la configuración consultada', observer: 'Solo lectura. Toma el control de la edición antes de confirmar un cambio.' },
    fr: { states: {
        preview: 'Vérifiez cette modification avant de l’enregistrer.', committing: 'Enregistrement de la modification vérifiée…', saved: 'La modification est enregistrée.',
        unknown: 'Impossible de confirmer si la modification a été enregistrée. Consultez les paramètres actuels avant de continuer.',
        conflict: 'Les paramètres ont changé dans une autre fenêtre. Consultez la dernière version et vérifiez à nouveau.',
        stale: 'Cette fenêtre n’est plus à jour. Consultez les paramètres actuels avant une nouvelle vérification.',
        cancelled: 'Aucune modification n’a été effectuée.', unavailable: 'Les paramètres sont indisponibles. Consultez-les à nouveau avant de réessayer d’enregistrer.' },
        confirm: 'Confirmer la modification', cancel: 'Annuler la modification', dismiss: 'Fermer la vérification', reload: 'Consulter les paramètres actuels',
        before: 'Avant', after: 'Après', effects: 'Modifications à vérifier', details: 'Détails techniques',
        revision: 'Révision des paramètres vérifiés', observer: 'Lecture seule. Prenez le contrôle de l’édition avant de confirmer une modification.' },
    pt: { states: {
        preview: 'Reveja esta alteração antes de guardar.', committing: 'A guardar a alteração revista…', saved: 'A alteração está guardada.',
        unknown: 'Não foi possível confirmar se a alteração foi guardada. Consulte as definições atuais antes de continuar.',
        conflict: 'As definições foram alteradas noutra janela. Consulte a versão mais recente e reveja novamente.',
        stale: 'Esta janela já não está atualizada. Consulte as definições atuais antes de voltar a rever.',
        cancelled: 'Não foram efetuadas alterações.', unavailable: 'As definições estão indisponíveis. Consulte-as novamente antes de tentar guardar.' },
        confirm: 'Confirmar alteração', cancel: 'Cancelar alteração', dismiss: 'Fechar revisão', reload: 'Consultar definições atuais',
        before: 'Antes', after: 'Depois', effects: 'Alterações a rever', details: 'Detalhes técnicos',
        revision: 'Revisão das definições consultadas', observer: 'Só de leitura. Assuma o controlo da edição antes de confirmar uma alteração.' },
});

/** Select one complete language resource; never mix partial messages across locales. */
export function reviewCopy(choice: unknown, nativeLanguage: unknown = 'en'): ReviewCopy {
    const requested = choice === 'auto' ? nativeLanguage : choice;
    const locale = typeof requested === 'string' ? requested.toLowerCase().split('-')[0] : '';
    return Object.hasOwn(copies, locale) ? copies[locale] : copies.en;
}
