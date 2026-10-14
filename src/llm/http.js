import { LLMError, LLMErrorKind } from './llm-error.js';

/**
 * POSTs JSON and returns the parsed JSON body, mapping every failure to an LLMError.
 * @param {typeof fetch} fetchImpl injectable for tests
 */
export async function postJson(fetchImpl, url, { headers, body, signal, provider }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw new LLMError(LLMErrorKind.TIMEOUT, `${provider} request was aborted`, { cause: error });
    throw new LLMError(LLMErrorKind.PROVIDER, `${provider} unreachable: ${error.message}`, { cause: error });
  }

  const text = await response.text();
  if (!response.ok) {
    throw new LLMError(kindForStatus(response.status), `${provider} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new LLMError(LLMErrorKind.PROVIDER, `${provider} returned a non-JSON body`);
  }
}

function kindForStatus(status) {
  if (status === 401 || status === 403) return LLMErrorKind.AUTH;
  if (status === 429) return LLMErrorKind.RATE_LIMITED;
  return LLMErrorKind.PROVIDER;
}
