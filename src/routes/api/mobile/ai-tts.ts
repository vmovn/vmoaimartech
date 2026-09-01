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
        const { text, voice } = (await request.json().catch(() => ({}))) as {
          text?: string;
          voice?: string;
        };
        if (!text) return new Response('text required', { status: 400 });
        void voice;
        return Response.json(
          { error: 'Text-to-speech is unavailable because no independent TTS provider is configured.' },
          { status: 503 },
        );
      },
    },
  },
});
