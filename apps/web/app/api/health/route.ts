export async function GET() {
  return Response.json(
    { ok: true, service: 'livia-web', localAgent: 'separate-process' },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
