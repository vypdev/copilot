<script lang="ts">
    import type { ProfileDraft } from '../domain/profile_draft.ts';
    import type { CenterCopy } from '../domain/center_copy_types.ts';
    let { draft, copy }: { draft: ProfileDraft; copy: CenterCopy } = $props();
    const m = $derived(copy.messages);
</script>
<label for="profile-scope">{m.scope}</label><select id="profile-scope" bind:value={draft.kind}>
    <option value="global">{m.global}</option><option value="host">{m.host}</option><option value="account">{m.account}</option>
    <option value="organization">{m.organization}</option><option value="repository">{m.repository}</option>
</select>
{#if draft.kind === 'account' || draft.kind === 'organization' || draft.kind === 'repository'}
    <label for="profile-account">{m.accountId}</label><input id="profile-account" type="text" inputmode="numeric" pattern={'[1-9][0-9]{0,19}'} maxlength="20" required bind:value={draft.accountId}>
{/if}
{#if draft.kind === 'organization'}
    <label for="profile-organization">{m.organizationId}</label><input id="profile-organization" type="text" inputmode="numeric" pattern={'[1-9][0-9]{0,19}'} maxlength="20" required bind:value={draft.organizationId}>
{/if}
{#if draft.kind === 'repository'}
    <label for="profile-repository">{m.repositoryId}</label><input id="profile-repository" type="text" inputmode="numeric" pattern={'[1-9][0-9]{0,19}'} maxlength="20" required bind:value={draft.repositoryId}>
{/if}
<label for="profile-density">{m.density}</label><select id="profile-density" bind:value={draft.density}>
    <option value="inherit">{m.inherit}</option><option value="comfortable">{m.comfortable}</option><option value="compact">{m.compact}</option>
</select>
<label for="profile-paused">{m.paused}</label><select id="profile-paused" bind:value={draft.paused}>
    <option value="inherit">{m.inherit}</option><option value="yes">{m.yes}</option><option value="no">{m.no}</option>
</select>
<label for="profile-shortcuts">{m.shortcuts}</label><select id="profile-shortcuts" bind:value={draft.shortcuts}>
    <option value="inherit">{m.inherit}</option><option value="yes">{m.yes}</option><option value="no">{m.no}</option>
</select>
