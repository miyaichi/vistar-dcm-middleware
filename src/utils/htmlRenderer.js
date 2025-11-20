const escapeHtml = (value) => {
  if (value == null) {
    return '';
  }

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const sanitizeUrl = (value) => {
  if (!value || typeof value !== 'string') {
    return '';
  }

  try {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    // Allow only HTTP(S) URLs or same-origin paths
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
      return trimmed;
    }
  } catch (error) {
    return '';
  }

  return '';
};

const buildMediaElement = ({ ad, assetUrl }) => {
  const fallback = '<div class="media-fallback">Unsupported creative</div>';

  if (!ad || !assetUrl) {
    return fallback;
  }

  const mimeType = (ad.mime_type || '').toLowerCase();
  const altText = escapeHtml(ad.advertiser || ad.creative_id || 'Creative');
  const loopVideos = process.env.VIDEO_LOOP === 'true';

  if (mimeType.startsWith('video/')) {
    return `<video id="creative"
      src="${escapeHtml(assetUrl)}"
      autoplay
      muted
      playsinline
      preload="auto"
      ${loopVideos ? 'loop' : ''}
      controls
      poster="${escapeHtml(ad.poster_url || '')}">
    </video>`;
  }

  if (mimeType.startsWith('image/')) {
    return `<img id="creative" src="${escapeHtml(assetUrl)}" alt="${altText}" />`;
  }

  return fallback;
};

const buildMetadataBlock = ({ placementId, ad }) => {
  const lines = [
    placementId ? `Placement: ${escapeHtml(placementId)}` : null,
    ad?.creative_id ? `Creative: ${escapeHtml(ad.creative_id)}` : null,
    ad?.campaign_id ? `Campaign: ${escapeHtml(ad.campaign_id)}` : null,
    ad?.mime_type ? `MIME: ${escapeHtml(ad.mime_type)}` : null,
    ad?.length_in_seconds ? `Duration: ${escapeHtml(ad.length_in_seconds)}s` : null
  ].filter(Boolean);

  if (!lines.length) {
    return '';
  }

  return `<div class="meta">${lines.join(' &middot; ')}</div>`;
};

const buildPopProxyUrl = (proofUrl, ad) => {
  if (!proofUrl) {
    return '';
  }

  const params = new URLSearchParams({ url: proofUrl });
  if (ad?.event_id) {
    params.append('eventId', String(ad.event_id));
  }
  if (ad?.display_time) {
    params.append('display_time', String(ad.display_time));
  }

  return `/pop?${params.toString()}`;
};

const renderAdHtml = ({
  ad,
  placementId,
  assetUrl,
  environment = 'staging',
  note = ''
}) => {
  if (!ad) {
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vistar Creative Placeholder</title>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        height: 100%;
        background: #000;
        color: #fff;
        font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .empty-state {
        text-align: center;
        padding: 24px;
      }
    </style>
  </head>
  <body>
    <div class="empty-state">
      <p style="font-size: 32px; margin-bottom: 8px;">No ad available</p>
      <small>Placement: ${escapeHtml(placementId || 'unknown')}</small>
    </div>
  </body>
</html>`;
  }

  const proofUrl = sanitizeUrl(ad.proof_of_play_url);
  const expirationUrl = sanitizeUrl(ad.expiration_url);
  const popProxyUrl = buildPopProxyUrl(proofUrl, ad);
  const mediaElement = buildMediaElement({ ad, assetUrl });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vistar Creative</title>
    <style>
      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: #000;
        color: #fff;
        font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      }

      body {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }

      #creative {
        max-width: 100%;
        max-height: 100%;
        width: 100%;
        height: 100%;
        object-fit: contain;
        background: #000;
      }

      .meta {
        position: absolute;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 14px;
        opacity: 0.8;
      }
    </style>
  </head>
  <body>
    ${mediaElement}
    ${buildMetadataBlock({ placementId, ad })}
    <script>
      (function() {
        const proofUrl = ${JSON.stringify(proofUrl)};
        const popProxyUrl = ${JSON.stringify(popProxyUrl)};
        const expirationUrl = ${JSON.stringify(expirationUrl)};

        const fire = (url) => {
          if (!url) return;
          fetch(url, { method: 'GET', mode: 'no-cors' }).catch(() => {});
        };

        const fireProof = () => {
          if (!popProxyUrl) {
            fire(proofUrl);
            return;
          }

          fetch(popProxyUrl, { method: 'GET', credentials: 'omit' })
            .then((response) => {
              if (!response.ok) {
                throw new Error('PoP proxy failed');
              }
            })
            .catch(() => fire(proofUrl));
        };

        window.addEventListener('load', fireProof, { once: true });
        window.addEventListener('beforeunload', () => fire(expirationUrl));
      })();
    </script>
  </body>
</html>`;
};

module.exports = {
  renderAdHtml
};
