export type Urgency = 'baja' | 'media' | 'alta';

export const URGENCY_LABELS: Record<Urgency, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
};

export type DeclaredUse = 'comercial' | 'muestra' | 'repuesto' | 'uso_personal' | 'otro';

export const DECLARED_USE_LABELS: Record<DeclaredUse, string> = {
  comercial: 'Comercial',
  muestra: 'Muestra sin valor comercial',
  repuesto: 'Repuesto',
  uso_personal: 'Uso personal',
  otro: 'Otro',
};

export type ScenarioKey = 'maritime_only' | 'maritime_courier' | 'maritime_air' | 'air_only';

export const SCENARIO_KEY_LABELS: Record<ScenarioKey, string> = {
  maritime_only: 'Marítimo completo',
  maritime_courier: 'Marítimo + courier parcial',
  maritime_air: 'Marítimo + aéreo parcial',
  air_only: 'Aéreo completo',
};

export type CourierEligibility = 'courier_eligible' | 'courier_not_eligible' | 'courier_requires_pjm_review';

export const COURIER_ELIGIBILITY_LABELS: Record<CourierEligibility, string> = {
  courier_eligible: 'Elegible para courier',
  courier_not_eligible: 'No elegible para courier',
  courier_requires_pjm_review: 'Requiere revisión PJM',
};

export type CourierIneligibilityReason =
  | 'exceeds_max_value'
  | 'exceeds_max_weight_per_package'
  | 'exceeds_max_quantity_per_species'
  | 'declared_commercial_use'
  | 'ncm_intervention_or_restriction'
  | 'cargo_not_divisible'
  | 'requires_documentary_validation'
  | 'insufficient_information';

export const COURIER_INELIGIBILITY_REASON_LABELS: Record<CourierIneligibilityReason, string> = {
  exceeds_max_value: 'Supera el valor FOB máximo permitido para courier',
  exceeds_max_weight_per_package: 'Supera el peso máximo por paquete',
  exceeds_max_quantity_per_species: 'Supera la cantidad máxima de unidades de la misma especie',
  declared_commercial_use: 'Uso declarado comercial (el régimen courier exige fin no comercial)',
  ncm_intervention_or_restriction: 'La posición NCM tiene intervención o restricción asociada',
  cargo_not_divisible: 'La mercadería no fue marcada como divisible',
  requires_documentary_validation: 'Requiere validación documental antes de confirmar el régimen',
  insufficient_information: 'Falta información mínima (peso o valor por unidad) para estimar el escenario',
};

export type ScenarioRecommendation = 'recommended' | 'review' | 'not_eligible';

export const SCENARIO_RECOMMENDATION_LABELS: Record<ScenarioRecommendation, string> = {
  recommended: 'Recomendado',
  review: 'A revisar',
  not_eligible: 'No elegible',
};

export type ScenarioReviewStatus = 'none' | 'requested' | 'validated' | 'rejected';

export const SCENARIO_REVIEW_STATUS_LABELS: Record<ScenarioReviewStatus, string> = {
  none: 'Sin solicitar',
  requested: 'Análisis solicitado',
  validated: 'Validado por PJM',
  rejected: 'Rechazado por PJM',
};

export type AlternativeScenarioStatus = 'generated' | 'preferred' | 'requested_review' | 'pjm_validated' | 'pjm_rejected';

export const ALTERNATIVE_SCENARIO_STATUS_LABELS: Record<AlternativeScenarioStatus, string> = {
  generated: 'Generado',
  preferred: 'Marcado como preferido',
  requested_review: 'Análisis PJM solicitado',
  pjm_validated: 'Validado por PJM',
  pjm_rejected: 'Rechazado por PJM',
};
