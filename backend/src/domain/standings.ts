// Standard competition ranking (ties share a rank; the next distinct
// score's rank accounts for the tied group's size, e.g. 1,1,3 not 1,1,2) —
// PRD §5/§6 don't specify tie-breaking beyond "sum of points," so this is
// the least-surprising default. Shared by the live leaderboard
// (gameLoop.service.ts) and the end-of-game ResultsSnapshot
// (results.service.ts), which differ only in who they rank.

import type { Participant, PodiumEntry } from "../types/session.js";

export function rankStandings(participants: Participant[]): PodiumEntry[] {
  const sorted = [...participants].sort((a, b) => b.score - a.score);

  const ranked: PodiumEntry[] = [];
  let lastScore: number | undefined;
  let lastRank = 0;
  sorted.forEach((p, index) => {
    const rank = p.score === lastScore ? lastRank : index + 1;
    let correctCount = 0;
    for (const answer of p.answers.values()) if (answer.isCorrect) correctCount++;
    ranked.push({
      participantId: p.id,
      displayName: p.displayName,
      avatar: p.avatar,
      score: p.score,
      rank,
      correctCount,
      answeredCount: p.answers.size,
    });
    lastScore = p.score;
    lastRank = rank;
  });
  return ranked;
}
