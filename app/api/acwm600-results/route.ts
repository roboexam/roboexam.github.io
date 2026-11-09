import bundle from '../../data/generated/acwm600-results.json';
import summary from '../../data/generated/acwm600-summary.json';

/** Frozen public result data only; never accepts a host filesystem path. */
export function GET(request: Request) {
  if (new URL(request.url).searchParams.size !== 0) return Response.json({ error: 'invalid_query' }, { status: 400 });
  return Response.json(bundle, { headers: {
    'cache-control': 'public, max-age=0, must-revalidate',
    'content-disposition': 'attachment; filename="acwm600-results.json"',
    etag: `"${summary.fullBundleSha256}"`,
  } });
}
