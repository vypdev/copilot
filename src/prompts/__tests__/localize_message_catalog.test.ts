import { getLocalizeMessageCatalogPrompt } from '../localize_message_catalog';

describe('localize message catalog prompt', () => {
  it('carries the exact target, IDs, placeholders, and plural variants', () => {
    const prompt = getLocalizeMessageCatalogPrompt({
      targetLocale: 'fr-FR',
      messages: { heading: 'Hello {name}', count: { one: '{count} item', other: '{count} items' } },
    });
    expect(prompt).toContain('fr-FR');
    expect(prompt).toContain('"heading":"Hello {name}"');
    expect(prompt).toContain('"one":"{count} item"');
    expect(prompt).toContain('Return only the schema-constrained JSON object');
  });
});
