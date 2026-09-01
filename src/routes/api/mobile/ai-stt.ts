/**
 * Mobile speech-to-text endpoint. No independent STT provider abstraction is
 * currently implemented, so the capability is explicitly unavailable.
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
        return Response.json(
          { error: 'Speech-to-text is unavailable because no independent STT provider is configured.' },
          { status: 503 },
        );
      },
    },
  },
});
