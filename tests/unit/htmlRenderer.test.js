const { renderAdHtml } = require('../../src/utils/htmlRenderer');

describe('htmlRenderer', () => {
  test('proxies PoP URLs through middleware endpoint with metadata', () => {
    const html = renderAdHtml({
      ad: {
        proof_of_play_url: 'https://pop.example.com/evt?event=1',
        expiration_url: 'https://pop.example.com/expire',
        event_id: 'evt-123',
        display_time: 1700000000,
        mime_type: 'image/png',
        asset_url: 'https://cdn.example.com/image.png'
      },
      placementId: 'proxy-test',
      assetUrl: 'https://cdn.example.com/image.png'
    });

    expect(html).toContain('/pop?');
    expect(html).toContain(encodeURIComponent('https://pop.example.com/evt?event=1'));
    expect(html).toContain('eventId=evt-123');
    expect(html).toContain('display_time=1700000000');
  });
});
