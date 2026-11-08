/** Deterministic test producer; production never converts rejected prose into assessments. */
export function assessmentWireFixture(response: { requirements: readonly Record<string, unknown>[] } & Record<string, unknown>,
    schema: Record<string, unknown>, uncertainIds: readonly string[] = []): Record<string, unknown> {
    const fields = (((schema.properties as Record<string, unknown>).requirements as Record<string, unknown>).items as Record<string, unknown>).properties as Record<string, unknown>;
    if (!fields.assessment) return response;
    return { ...response, requirements: response.requirements.map(fact => {
        let assessment = 'execution-unverified';
        if (fact.status === 'supported') assessment = 'supported';
        else if (fact.status === 'missing') assessment = fact.evidence === 'contradictory' ? 'contradictory' : 'missing';
        else if (uncertainIds.includes(fact.id as string)) assessment = 'scope-unclear';
        else if (fact.evidence === 'source-only') assessment = 'source-unverified';
        else if (fact.evidence === 'unavailable') assessment = 'evidence-unavailable';
        else if (fact.evidence === 'contradictory') assessment = 'evidence-contradictory';
        const { status: _status, evidence: _evidence, summary: _summary, remaining: _remaining, ...identity } = fact;
        return { ...identity, assessment };
    }) };
}
