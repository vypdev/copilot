<script lang="ts">
    import type { ProfileDraft } from '../domain/profile_draft.ts';
    import type { CenterCopy } from '../domain/center_copy_types.ts';
    import type { ConnectionOutcome } from '../domain/named_sessions.ts';
    import { profileScopeChoices } from '../domain/profile_context.ts';
    import { profileContextCopy } from '../domain/profile_context_copy.ts';
    import ScopeIdentitySelect from './ScopeIdentitySelect.svelte';
    let { draft, copy, connections }: { draft: ProfileDraft; copy: CenterCopy; connections?: ConnectionOutcome | null } = $props();
    const m = $derived(copy.messages);
    const words = $derived(profileContextCopy(copy.locale));
    const choices = $derived(profileScopeChoices(connections, draft));
</script>
<label for="profile-scope">{m.scope}</label><select id="profile-scope" bind:value={draft.kind}>
    <option value="global">{m.global}</option><option value="host">{m.host}</option><option value="account">{m.account}</option>
    <option value="organization">{m.organization}</option><option value="repository">{m.repository}</option>
</select>
{#if draft.kind === 'account' || draft.kind === 'organization' || draft.kind === 'repository'}
    <p>{words.scopeHint}</p>{#if choices.accounts.length === 0}<p role="status">{words.noIdentities}</p>{/if}
    <label for="profile-account">{m.account}</label><ScopeIdentitySelect id="profile-account" choices={choices.accounts} selected={draft.accountId}
        choose={words.choose} unavailable={words.savedScope} select={value => { draft.accountId = value; draft.repositoryId = ''; draft.organizationId = ''; }}/>
{/if}
{#if draft.kind === 'organization'}
    <label for="profile-organization">{m.organization}</label><ScopeIdentitySelect id="profile-organization" choices={choices.organizations} selected={draft.organizationId}
        choose={words.choose} unavailable={words.savedScope} select={value => { draft.organizationId = value; }}/>
{/if}
{#if draft.kind === 'repository'}
    <label for="profile-repository">{m.repository}</label><ScopeIdentitySelect id="profile-repository" choices={choices.repositories} selected={draft.repositoryId}
        choose={words.choose} unavailable={words.savedScope} select={value => { draft.repositoryId = value; }}/>
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
