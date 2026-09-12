import { verifyPullRequest, PullRequestStatus } from "./verify";

export interface GitHubRealityCheck {
  referencedPR?: number;
  prStatus?: PullRequestStatus;
  reconciliationNote: string;
  isAutoResolved: boolean;
}

export async function reconcileBlockerWithGitHub(
  subject: string,
  evidence: string[] = [],
  defaultOwnerRepo?: string,
): Promise<GitHubRealityCheck | null> {
  const combinedText = `${subject} ${evidence.join(" ")}`;

  // Match patterns like: PR #42, PR#42, pull/42, #42
  const prMatch =
    combinedText.match(/(?:PR|pr|pull|#)\s*#?([0-9]+)/i) ||
    combinedText.match(/pull\/([0-9]+)/i);

  if (!prMatch) {
    return null;
  }

  const pullNumber = parseInt(prMatch[1], 10);
  if (isNaN(pullNumber)) {
    return null;
  }

  const repoString = defaultOwnerRepo || process.env.GITHUB_REPO || "redbull93/red";
  const [owner, repo] = repoString.split("/");

  if (!owner || !repo) {
    return null;
  }

  const pr = await verifyPullRequest(owner, repo, pullNumber);
  if (!pr) {
    return {
      referencedPR: pullNumber,
      reconciliationNote: `Referenced PR #${pullNumber} could not be inspected on GitHub.`,
      isAutoResolved: false,
    };
  }

  if (pr.merged) {
    return {
      referencedPR: pullNumber,
      prStatus: pr,
      reconciliationNote: `GitHub Reality Check: PR #${pullNumber} ("${pr.title}") is already MERGED! Blocked engineer can rebase/pull latest main.`,
      isAutoResolved: true,
    };
  }

  if (pr.ciState === "failure") {
    return {
      referencedPR: pullNumber,
      prStatus: pr,
      reconciliationNote: `GitHub Reality Check: PR #${pullNumber} is OPEN, but CI checks are FAILING. Author @${pr.author} needs to fix CI build.`,
      isAutoResolved: false,
    };
  }

  if (pr.state === "open") {
    return {
      referencedPR: pullNumber,
      prStatus: pr,
      reconciliationNote: `GitHub Reality Check: PR #${pullNumber} is OPEN and CI is ${pr.ciState ?? "pending"}. Awaiting merge/review from @${pr.author}.`,
      isAutoResolved: false,
    };
  }

  return {
    referencedPR: pullNumber,
    prStatus: pr,
    reconciliationNote: `GitHub Reality Check: PR #${pullNumber} is CLOSED without merge.`,
    isAutoResolved: false,
  };
}
