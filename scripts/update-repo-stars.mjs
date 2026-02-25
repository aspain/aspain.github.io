#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const REPOS = [
  'aspain/git-sweaty',
  'aspain/spainify'
];

const API_BASE_URL = 'https://api.github.com/repos';
const OUTPUT_PATH = path.resolve(process.cwd(), 'public/repo-stars.json');

function buildHeaders() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'aspain-github-io-star-refresh'
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function fetchRepoStars(repo, headers) {
  const response = await fetch(`${API_BASE_URL}/${repo}`, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to fetch ${repo}: ${response.status} ${response.statusText} ${body.slice(0, 180)}`);
  }

  const payload = await response.json();
  const stars = Number(payload.stargazers_count);
  if (!Number.isFinite(stars)) {
    throw new Error(`Missing stargazers_count for ${repo}`);
  }

  return stars;
}

async function main() {
  const headers = buildHeaders();
  const repos = {};

  for (const repo of REPOS) {
    repos[repo] = await fetchRepoStars(repo, headers);
  }

  const output = {
    updatedAt: new Date().toISOString(),
    repos
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  process.stdout.write(`Updated ${OUTPUT_PATH}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
