const fetchFn = (...args) => {
  if (typeof fetch === 'function') {
    return fetch(...args);
  }

  return import('node-fetch').then(({ default: nodeFetch }) => nodeFetch(...args));
};

const parseInteger = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

class ProofOfPlaySendError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = 'ProofOfPlaySendError';
    this.statusCode = statusCode;
  }
}

const resolveTimeout = () => {
  const parsed = parseInteger(process.env.POP_FORWARD_TIMEOUT_MS, 5000);
  return Math.max(parsed, 1000);
};

const resolveRetryConfig = () => ({
  attempts: Math.max(parseInteger(process.env.POP_FORWARD_MAX_RETRIES, 3), 1),
  delayMs: Math.max(parseInteger(process.env.POP_FORWARD_RETRY_DELAY_MS, 500), 0)
});

const resolveUserAgent = () =>
  `vistar-dcm-middleware/${process.env.npm_package_version || 'dev'}`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeError = (error) => {
  if (error instanceof ProofOfPlaySendError) {
    return error;
  }

  if (error?.name === 'AbortError') {
    const timeoutError = new ProofOfPlaySendError('PoP request timed out', 504);
    timeoutError.timeout = true;
    return timeoutError;
  }

  const wrapped = new ProofOfPlaySendError(error?.message || 'Failed to send PoP request');
  wrapped.cause = error;
  return wrapped;
};

const shouldRetry = (error) => {
  if (error instanceof ProofOfPlaySendError) {
    if (error.timeout) {
      return true;
    }

    if (typeof error.statusCode === 'number') {
      return error.statusCode >= 500;
    }
  }

  return true;
};

const executeRequest = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const response = await fetchFn(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': resolveUserAgent(),
        'Cache-Control': 'no-cache',
        Accept: '*/*'
      }
    });

    const durationMs = Date.now() - start;

    if (!response.ok) {
      const error = new ProofOfPlaySendError(
        `PoP endpoint responded with HTTP ${response.status}`,
        response.status
      );
      error.responseStatus = response.status;
      error.durationMs = durationMs;
      throw error;
    }

    return {
      status: response.status,
      durationMs
    };
  } catch (error) {
    const normalized = normalizeError(error);
    if (normalized.durationMs == null) {
      normalized.durationMs = Date.now() - start;
    }
    throw normalized;
  } finally {
    clearTimeout(timeout);
  }
};

const sendProofOfPlay = async ({ url }) => {
  if (!url) {
    throw new ProofOfPlaySendError('PoP url is required', 400);
  }

  const timeoutMs = resolveTimeout();
  const { attempts: maxAttempts, delayMs } = resolveRetryConfig();
  let attempt = 0;
  let lastError;

  while (attempt < maxAttempts) {
    attempt += 1;

    try {
      const result = await executeRequest(url, timeoutMs);
      return {
        ...result,
        attempts: attempt
      };
    } catch (error) {
      const normalized = normalizeError(error);
      normalized.attempts = attempt;
      lastError = normalized;

      if (attempt >= maxAttempts || !shouldRetry(normalized)) {
        throw normalized;
      }

      await wait(delayMs);
    }
  }

  throw lastError;
};

module.exports = {
  sendProofOfPlay,
  ProofOfPlaySendError
};
