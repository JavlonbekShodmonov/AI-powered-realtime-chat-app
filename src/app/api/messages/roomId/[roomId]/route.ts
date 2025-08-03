import { getMessages } from '@/lib/message.controller';

export async function GET(req: Request, { params }: { params: { roomId: string } }) {

    const roomId = params.roomId;
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') ?? '1') || 1;
    const limit = parseInt(searchParams.get('limit') ?? '20') || 20;
   try {
    const messages = await getMessages({ roomId, page, limit });
    return Response.json(messages);
  } catch (error) {
    console.error('GET /api/messages/[roomId] error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
