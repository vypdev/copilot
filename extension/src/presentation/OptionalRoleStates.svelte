<script lang="ts">
    import { WRITE_PURPOSES } from '../domain/credential_roles.ts';
    import type { CredentialRoleCopy } from '../domain/credential_role_copy.ts';
    import type { ConnectionsView } from '../domain/named_sessions.ts';
    import type { ConnectionActions } from '../domain/connection_ui.ts';
    let { ready, copy, disabled, actions }: { ready: ConnectionsView | null; copy: CredentialRoleCopy; disabled: boolean; actions: ConnectionActions } = $props();
</script>
<section data-optional-roles aria-label={copy.purpose}>
    <p>{copy.grant}</p><p>{copy.availability}</p>
    {#each WRITE_PURPOSES as purpose}
        {@const slot = ready?.optionalWrites?.[purpose]}
        <div data-role-purpose={purpose}><h3>{copy.labels[purpose]}</h3>
            <p role="status">{ready ? copy.states[slot?.state ?? 'disabled'] : copy.unavailable}</p>
            {#if slot && slot.selected !== null}
                <button type="button" {disabled} onclick={() => { if (!disabled && ready) actions.change({ type: 'disable-role', purpose }, ready.revision); }}>{copy.disable}</button>
            {/if}
        </div>
    {/each}
</section>
