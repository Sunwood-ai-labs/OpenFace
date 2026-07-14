import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';

export const dynamic = 'force-dynamic';

const FORGEJO_API = process.env.FORGEJO_API || 'http://forgejo:3000/api/v1';
const FORGEJO_TOKEN_FILE = process.env.FORGEJO_TOKEN_FILE || '/shared/token';
const RUNNER_API = (process.env.RUNNER_API || 'http://spaces-runner:8000/api').replace(/\/$/, '');

function controlToken(): string | null {
  try {
    return fs.readFileSync(FORGEJO_TOKEN_FILE, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

async function forgejoFetch(path: string, cookie: string) {
  return fetch(`${FORGEJO_API}${path}`, {
    headers: { Accept: 'application/json', Cookie: cookie },
    cache: 'no-store',
  });
}

async function canControlSpace(request: NextRequest, owner: string, repo: string): Promise<Response | null> {
  const cookie = request.headers.get('cookie') || '';
  if (!cookie) return NextResponse.json({ error: 'Forgejo sign-in is required.' }, { status: 401 });

  const [userResponse, repoResponse] = await Promise.all([
    forgejoFetch('/user', cookie),
    forgejoFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, cookie),
  ]);
  if (!userResponse.ok) return NextResponse.json({ error: 'Forgejo sign-in is required.' }, { status: 401 });
  if (!repoResponse.ok) return NextResponse.json({ error: 'Repository is unavailable.' }, { status: 404 });

  const repoInfo = await repoResponse.json() as { permissions?: { push?: boolean }; private?: boolean };
  if (!repoInfo.permissions?.push) {
    return NextResponse.json({ error: 'Write permission on this Space is required.' }, { status: 403 });
  }
  if (repoInfo.private) {
    return NextResponse.json({ error: 'Private Spaces are disabled by deployment policy.' }, { status: 403 });
  }
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { owner: string; repo: string; action: string } },
) {
  if (params.action !== 'start' && params.action !== 'stop') {
    return NextResponse.json({ error: 'Unsupported Space action.' }, { status: 404 });
  }

  const denied = await canControlSpace(request, params.owner, params.repo);
  if (denied) return denied;

  const token = controlToken();
  if (!token) return NextResponse.json({ error: 'Space control is not configured.' }, { status: 503 });

  const response = await fetch(
    `${RUNNER_API}/spaces/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/${params.action}`,
    {
      method: 'POST',
      headers: { 'X-OpenFace-Control-Token': token },
      cache: 'no-store',
    },
  );
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') || 'application/json' },
  });
}
