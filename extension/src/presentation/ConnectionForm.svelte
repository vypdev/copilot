<script lang="ts">
    import type { ConnectionCopy } from '../domain/connection_copy.ts';
    import type { ConnectionActions } from '../domain/connection_ui.ts';
    import type { SessionPurpose } from '../domain/credential_roles.ts';
    import type { CredentialRoleCopy } from '../domain/credential_role_copy.ts';
    let { copy, roles, disabled, actions }: { copy: ConnectionCopy; roles: CredentialRoleCopy; disabled: boolean; actions: ConnectionActions } = $props();
    let purpose = $state<SessionPurpose>('repository-read');
</script>
<form onsubmit={event => { event.preventDefault(); if (!disabled) actions.connect(event.currentTarget); }} oninput={() => actions.dirty(true)}
    onreset={() => { purpose = 'repository-read'; actions.dirty(false); }}>
    <fieldset {disabled}>
        <legend>{copy.connect}</legend>
        <label for="connection-purpose">{roles.purpose}</label><select id="connection-purpose" name="purpose" bind:value={purpose} required>
            <option value="repository-read">{roles.labels['repository-read']}</option>
            <option value="issues-write">{roles.labels['issues-write']}</option>
            <option value="actions-write">{roles.labels['actions-write']}</option>
        </select>
        <p>{roles.hints[purpose]}</p>{#if purpose !== 'repository-read'}<p>{roles.availability}</p>{/if}
        <label for="connection-name">{copy.name}</label><input id="connection-name" name="name" required maxlength="64" autocomplete="off"/>
        <label for="connection-repository">{copy.repository}</label>
        <input id="connection-repository" name="repository" required maxlength="201" pattern="[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+" autocomplete="off" spellcheck="false"/>
        <label for="connection-secret">{roles.credential}</label>
        <input id="connection-secret" name="secret" type="password" required minlength="8" maxlength="255" pattern="[A-Za-z0-9_]+" autocomplete="off" spellcheck="false"/>
        <button type="submit">{copy.connect}</button>
        <button type="reset">{roles.discard}</button>
    </fieldset>
</form>
