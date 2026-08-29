/**
 * Mobile text-to-speech proxy. Returns base64-encoded MP3 in JSON so the
 * React Native client can play it via a data URI without binary handling.
 * POST /api/mobile/ai-tts  { text, voice? }
 */
import { createFileRoute } from '@tanstack/react-router';
import { authenticateMobileRequest } from '@/lib/api/mobile-auth.server';

export const Route = createFileRoute('/api/mobile/ai-tts')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authed = await authenticateMobileRequest(request);
        if ('response' in authed) return authed.response;
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response('Missing LOVABLE_API_KEY', { status: 500 });

        const { text, voice } = (await request.json().catch(() => ({}))) as {
          text?: string;
          voice?: string;
        };
        if (!text) return new Response('text required', { status: 400 });

        const res = await fetch('https://ai.gateway.lovable.dev/v1/audio/speech', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'openai/gpt-4o-mini-tts',
            input: text,
            voice: voice ?? 'alloy',
            response_format: 'mp3',
          }),
        });
        if (!res.ok) {
          return new Response(await res.text(), { status: res.status });
        }
        const buf = new Uint8Array(await res.arrayBuffer());
        // Chunked base64 to avoid stack overflow on large buffers.
        let bin = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < buf.length; i += CHUNK) {
          bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)));
        }
        const b64 = btoa(bin);
        return Response.json({ audio_base64: b64, mime: 'audio/mpeg' });
      },
    },
  },
});
