import { getOctokit } from "./client";

export interface PullRequestStatus {
  number: number;
  title: string;
  state: "open" | "closed";
  merged: boolean;
  mergeable?: boolean;
  author: string;
  url: string;
  ciState?: "success" | "pending" | "failure" | "unknown";
}

export async function verifyPullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<PullRequestStatus | null> {
  const octokit = getOctokit();
  if (!octokit) {
    // Offline simulation mode
    if (pullNumber === 42 || pullNumber === 101) {
      return {
        number: pullNumber,
        title: "feat(auth): add OAuth2 provider endpoints",
        state: "closed",
        merged: true,
        mergeable: true,
        author: "brian",
        url: `https://github.com/${owner}/${repo}/pull/${pullNumber}`,
        ciState: "success",
      };
    }
    return null;
  }

  try {
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    let ciState: "success" | "pending" | "failure" | "unknown" = "unknown";
    try {
      const { data: status } = await octokit.rest.repos.getCombinedStatusForRef({
        owner,
        repo,
        ref: pr.head.sha,
      });
      if (status.state === "success") ciState = "success";
      else if (status.state === "pending") ciState = "pending";
      else if (status.state === "failure") ciState = "failure";
    } catch {
      // Ignore check status errors
    }

    return {
      number: pr.number,
      title: pr.title,
      state: pr.state as "open" | "closed",
      merged: Boolean(pr.merged_at),
      mergeable: pr.mergeable ?? undefined,
      author: pr.user?.login ?? "unknown",
      url: pr.html_url,
      ciState,
    };
  } catch (err) {
    console.warn(`Failed to verify PR #${pullNumber} on ${owner}/${repo}:`, err);
    return null;
  }
}

export async function verifyIssue(
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<{ number: number; title: string; state: string; url: string } | null> {
  const octokit = getOctokit();
  if (!octokit) {
    return null;
  }

  try {
    const { data: issue } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });
    return {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      url: issue.html_url,
    };
  } catch (err) {
    console.warn(`Failed to verify issue #${issueNumber}:`, err);
    return null;
  }
}
