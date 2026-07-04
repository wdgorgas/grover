/**
 * Anthropic API client — plain fetch, no SDK (zero-dependency kernel).
 *
 * Supports streaming (SSE) and non-streaming calls, prompt caching via
 * cache_control on the stable system prefix (§11.6), tool use for the loop
 * runner, and returns real usage numbers for the Cost Governor.
 */
import { getSecret } from './config.mjs';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

function headers() {
  const key = getSecret('anthropicApiKey');
  if (!key) {
    const err = new Error('No Anthropic API key configured. Add one in Settings.');
    err.code = 'no_key';
    throw err;
  }
  return {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': API_VERSION,
  };
}

/**
 * Build the system blocks with a cacheable stable prefix and a dynamic tail.
 * stable: constitution + skill + profile (changes rarely → cache it)
 * dynamic: retrieved memories, current state (changes per turn)
 */
export function systemBlocks(stable, dynamic) {
  const blocks = [];
  if (stable) blocks.push({ type: 'text', text: stable, cache_control: { type: 'ephemeral' } });
  if (dynamic) blocks.push({ type: 'text', text: dynamic });
  return blocks;
}

/**
 * Streaming call. onDelta(text) fires per token chunk.
 * Resolves with { text, usage, stopReason }.
 */
export async function streamMessage({ model, system, messages, maxTokens, onDelta, signal }) {
  const body = {
    model,
    system,
    messages,
    max_tokens: maxTokens,
    stream: true,
  };
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    const err = new Error(`Anthropic API ${res.status}: ${truncErr(errBody)}`);
    err.code = res.status === 401 ? 'bad_key' : res.status === 429 ? 'rate_limit' : 'api_error';
    err.status = res.status;
    throw err;
  }

  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let text = '';
  let stopReason = null;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE frames are separated by double newlines.
    const frames = buf.split('\n\n');
    buf = frames.pop(); // keep the trailing partial frame
    for (const frame of frames) {
      const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      let ev;
      try { ev = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }
      switch (ev.type) {
        case 'message_start':
          Object.assign(usage, ev.message?.usage || {});
          break;
        case 'content_block_delta':
          if (ev.delta?.type === 'text_delta') {
            text += ev.delta.text;
            onDelta?.(ev.delta.text);
          }
          break;
        case 'message_delta':
          if (ev.usage?.output_tokens != null) usage.output_tokens = ev.usage.output_tokens;
          if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
          break;
        case 'error': {
          const err = new Error(ev.error?.message || 'Stream error');
          err.code = 'stream_error';
          throw err;
        }
      }
    }
  }
  return { text, usage, stopReason };
}

/** Non-streaming call for internal plumbing (extraction, titles). */
export async function completeMessage({ model, system, messages, maxTokens }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ model, system, messages, max_tokens: maxTokens }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    const err = new Error(`Anthropic API ${res.status}: ${truncErr(errBody)}`);
    err.code = res.status === 401 ? 'bad_key' : 'api_error';
    throw err;
  }
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { text, usage: data.usage || {}, stopReason: data.stop_reason };
}

/**
 * Non-streaming call WITH tools (loop runner). Returns the raw content
 * blocks (text + tool_use) so the caller can drive the tool loop, plus the
 * concatenated text, usage, and stop_reason.
 */
export async function completeWithTools({ model, system, messages, tools, maxTokens }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ model, system, messages, tools, max_tokens: maxTokens }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    const err = new Error(`Anthropic API ${res.status}: ${truncErr(errBody)}`);
    err.code = res.status === 401 ? 'bad_key' : res.status === 429 ? 'rate_limit' : 'api_error';
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const content = data.content || [];
  const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { content, text, usage: data.usage || {}, stopReason: data.stop_reason };
}

function truncErr(s) {
  try {
    const j = JSON.parse(s);
    return j.error?.message || s.slice(0, 300);
  } catch { return s.slice(0, 300); }
}
