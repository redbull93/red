import { Octokit } from "@octokit/rest";

let _octokit: Octokit | null = null;

export function getOctokit(): Octokit | null {
  if (_octokit) return _octokit;

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return null;
  }

  try {
    _octokit = new Octokit({ auth: token });
    return _octokit;
  } catch (err) {
    console.warn("Failed to initialize Octokit:", err);
    return null;
  }
}

export function isGitHubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}
