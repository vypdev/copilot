<script lang="ts">
    import type { ConnectionCopy } from '../domain/connection_copy.ts';
    import type { ConnectionActions } from '../domain/connection_ui.ts';
    let { copy, disabled, actions }: { copy: ConnectionCopy; disabled: boolean; actions: ConnectionActions } = $props();
</script>
<form onsubmit={event => { event.preventDefault(); actions.connect(event.currentTarget); }} oninput={() => actions.dirty(true)}>
    <fieldset {disabled}>
        <legend>{copy.connect}</legend>
        <label for="connection-name">{copy.name}</label><input id="connection-name" name="name" required maxlength="64" autocomplete="off"/>
        <label for="connection-repository">{copy.repository}</label>
        <input id="connection-repository" name="repository" required maxlength="201" pattern="[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+" autocomplete="off" spellcheck="false"/>
        <label for="connection-secret">{copy.credential}</label>
        <input id="connection-secret" name="secret" type="password" required minlength="8" maxlength="255" pattern="[A-Za-z0-9_]+" autocomplete="off" spellcheck="false"/>
        <button type="submit">{copy.connect}</button>
    </fieldset>
</form>
