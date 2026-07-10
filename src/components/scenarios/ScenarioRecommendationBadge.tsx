import { Badge } from '@/components/ui/Badge';
import { SCENARIO_RECOMMENDATION_LABELS, type ScenarioRecommendation } from '@/types/scenarios';

const TONE: Record<ScenarioRecommendation, 'emerald' | 'amber' | 'rose'> = {
  recommended: 'emerald',
  review: 'amber',
  not_eligible: 'rose',
};

export function ScenarioRecommendationBadge({ recommendation }: { recommendation: ScenarioRecommendation }) {
  return <Badge tone={TONE[recommendation]}>{SCENARIO_RECOMMENDATION_LABELS[recommendation]}</Badge>;
}
