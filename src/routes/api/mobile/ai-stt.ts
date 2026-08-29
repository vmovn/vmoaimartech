/**
 * Mobile speech-to-text proxy. Accepts multipart audio and forwards to the
 * Lovable AI Gateway. Keeps the API key server-side.
 * POST /api/mobile/ai-stt (multipart: file, model?)
 */
import { createFileRoute } from '@tanstack/react-router';
import { authenticateMobileRequest } from '@/lib/api/mobile-auth.server';

export const Route = createFileRoute('/api/mobile/ai-stt')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authed = await authenticateMobileRequest(request);
        if ('response' in authed) return authed.response;
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response('Missing LOVABLE_API_KEY', { status: 500 });


        const form = await request.formData();
        if (!form.has('model')) form.append('model', 'openai/gpt-4o-mini-transcribe');
        const res = await fetch('https://ai.gateway.lovable.dev/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}` },
          body: form,
        });
        const text = await res.text();
        return new Response(text, {
          status: res.status,
          headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
        });
      },
    },
  },
});
