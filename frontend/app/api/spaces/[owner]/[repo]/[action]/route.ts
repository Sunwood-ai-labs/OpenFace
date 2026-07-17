import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';

export const dynamic = 'force-dynamic';

const FORGEJO_API = process.env.FORGEJO_API || 'http://forgejo:3000/api/v1';
const FORGEJO_WEB = process.env.FORGEJO_WEB || 'http://forgejo:3000';
const FORGEJO_TOKEN_FILE = process.env.FORGEJO_TOKEN_FILE || '/shared/token';
const RUNNER_API = (process.env.RUNNER_API || 'http://spaces-runner:8000/api').replace(/\/$/, '');

function controlToken(): string | null {
  try {
    return fs.readFileSync(FORGEJO_TOKEN_FILE, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

async function forgejoFetch(path: string) {
  return fetch(`${FORGEJO_API}${path}`, {
    headers: { Accept: 'application/json', Authorization: `token ${controlToken()}` },
    cache: 'no-store',
  });
}

async function canControlSpace(request: NextRequest, owner: string, repo: string): Promise<Response | null> {
  const cookie = request.headers.get('cookie') || '';
  if (!cookie) return NextResponse.json({ error: 'Forgejo sign-in is required.' }, { status: 401 });

  const repoResponse = await forgejoFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  if (!repoResponse.ok) return NextResponse.json({ error: 'Repository is unavailable.' }, { status: 404 });

  const repoInfo = await repoResponse.json() as { private?: boolean; default_branch?: string };
  if (repoInfo.private) {
    return NextResponse.json({ error: 'Private Spaces are disabled by deployment policy.' }, { status: 403 });
  }

  // Forgejo's REST API deliberately does not authenticate browser session cookies.
  // Its read-only new-file page, however, is available only to users who can push.
  const branch = encodeURIComponent(repoInfo.default_branch || 'main');
  const permissionProbe = await fetch(
    `${FORGEJO_WEB}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/_new/${branch}/`,
    { headers: { Cookie: cookie }, cache: 'no-store', redirect: 'manual' },
  );
  if (permissionProbe.status === 303 || permissionProbe.status === 302) {
    return NextResponse.json({ error: 'Forgejo sign-in is required.' }, { status: 401 });
  }
  if (!permissionProbe.ok) {
    return NextResponse.json({ error: 'Write permission on this Space is required.' }, { status: 403 });
  }
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; action: string }> },
) {
  const resolvedParams = await params;
  if (resolvedParams.action !== 'start' && resolvedParams.action !== 'stop') {
    return NextResponse.json({ error: 'Unsupported Space action.' }, { status: 404 });
  }

  const denied = await canControlSpace(request, resolvedParams.owner, resolvedParams.repo);
  if (denied) return denied;

  const token = controlToken();
  if (!token) return NextResponse.json({ error: 'Space control is not configured.' }, { status: 503 });

  const response = await fetch(
    `${RUNNER_API}/spaces/${encodeURIComponent(resolvedParams.owner)}/${encodeURIComponent(resolvedParams.repo)}/${resolvedParams.action}`,
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
