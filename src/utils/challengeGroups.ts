import { Challenge } from '../types';

export interface ChallengeGroup {
  id: string;
  label?: string;
  challenges: Challenge[];
}

export const isChallengeLive = (challenge: Challenge): boolean => {
  if (!challenge || challenge.status === 'failed') return false;
  if (challenge.totalPhases === 1) return !!challenge.phases.phase1?.completed;
  if (challenge.totalPhases === 2) return !!challenge.phases.phase1?.completed && !!challenge.phases.phase2?.completed;
  return !!challenge.phases.phase1?.completed && !!challenge.phases.phase2?.completed && !!challenge.phases.phase3?.completed;
};

export const getFinalPhaseForChallenge = (challenge: Challenge): 'phase1' | 'phase2' | 'phase3' => {
  if (challenge.totalPhases === 1) return 'phase1';
  if (challenge.totalPhases === 2) return 'phase2';
  return 'phase3';
};

export const getNextIncompletePhase = (challenge: Challenge): 'phase1' | 'phase2' | 'phase3' | null => {
  const orderedPhases = (['phase1', 'phase2', 'phase3'] as const).slice(0, challenge.totalPhases ?? 3);
  return orderedPhases.find(phase => !challenge.phases?.[phase]?.completed) ?? null;
};

export const groupChallengesByPurchase = (challenges: Challenge[]): ChallengeGroup[] => {
  const grouped = new Map<string, ChallengeGroup>();

  challenges.forEach((challenge) => {
    const groupId = challenge.purchaseGroupId || challenge.id;
    if (!grouped.has(groupId)) {
      grouped.set(groupId, {
        id: groupId,
        label: challenge.purchaseGroupLabel,
        challenges: [],
      });
    }
    grouped.get(groupId)!.challenges.push(challenge);
  });

  return Array.from(grouped.values()).map((group) => ({
    ...group,
    challenges: [...group.challenges].sort((a, b) => {
      const aIndex = a.purchaseGroupIndex ?? 0;
      const bIndex = b.purchaseGroupIndex ?? 0;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.createdAt.localeCompare(b.createdAt);
    }),
  }));
};
