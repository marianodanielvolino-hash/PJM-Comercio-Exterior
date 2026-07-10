import type { TransportMode, ContainerSelection } from './logistics';
import type { NCMStatus, InterventionAgency, InterventionRisk } from './ncm';
import type { Urgency, DeclaredUse } from './scenarios';

export type OperationType = 'importacion' | 'exportacion';

export type Incoterm = 'EXW' | 'FOB' | 'CFR' | 'CIF' | 'DAP' | 'DDP';

export type Currency = 'USD' | 'EUR' | 'ARS';

export type SimulationStatus =
  | 'draft'
  | 'completed'
  | 'sent_to_pjm'
  | 'under_review'
  | 'missing_documents'
  | 'ncm_review'
  | 'formal_quote_sent'
  | 'closed';

export const SIMULATION_STATUS_LABELS: Record<SimulationStatus, string> = {
  draft: 'Borrador',
  completed: 'Completa',
  sent_to_pjm: 'Enviada a PJM',
  under_review: 'En revisión',
  missing_documents: 'Falta documentación',
  ncm_review: 'Revisión NCM',
  formal_quote_sent: 'Cotización formal emitida',
  closed: 'Cerrada',
};

// Per-document type/status (Sprint 3) live in './documents' — import from
// there directly. This is the coarser rollup on `simulations.document_status`
// itself (distinct from any single document's lifecycle).
export type SimulationDocumentStatus = 'incomplete' | 'under_review' | 'observed' | 'approved';

export const SIMULATION_DOCUMENT_STATUS_LABELS: Record<SimulationDocumentStatus, string> = {
  incomplete: 'Incompleto',
  under_review: 'En revisión',
  observed: 'Observado',
  approved: 'Aprobado',
};

export interface OperationData {
  operationType: OperationType;
  transportMode: TransportMode;
  incoterm: Incoterm;
  originCountry: string;
  originPort: string;
  destinationPort: string;
  finalDestination: string;
  currency: Currency;
  exchangeRate: number;
  shipmentDate: string | null;
  arrivalDate: string | null;
  supplier: string;
  buyer: string;
}

export interface MerchandiseItem {
  id: string;
  description: string;
  technicalDescription: string;
  brandModel: string;
  intendedUse: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
  grossWeightKg: number;
  netWeightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  cbm: number;
  packages: number;
  packagingType: string;
  countryOfOrigin: string;
  ncmCode: string;
  ncmDescription: string;
  ncmStatus: NCMStatus;
  /** Set when the code came from the real catalog search (Sprint 2) vs free-text entry. */
  ncmPositionId: string | null;
  ncmSource: 'catalog' | 'manual';
  taxParameterId: string | null;
  /** Insumo del optimizador de escenarios alternativos de envío parcial (courier/aéreo). */
  isDivisible: boolean;
  minSeparableQty: number;
  weightPerUnitKg: number;
  urgency: Urgency;
  partialUrgentNeeded: boolean;
  urgentQtySuggested: number;
  declaredUse: DeclaredUse;
}

export interface InterventionSelection {
  agencies: InterventionAgency[];
  risk: InterventionRisk;
  notes: string;
}

export interface ChecklistItemState {
  key: string;
  label: string;
  checked: boolean;
}

export interface SimulationDraft {
  operation: OperationData;
  items: MerchandiseItem[];
  containers: ContainerSelection;
  intervention: InterventionSelection;
  logistics: {
    mainFreightRate: number;
    bafFsc: number;
    originLocalCharges: number;
    destinationLocalCharges: number;
    customsBrokerFee: number;
    insurancePercent: number;
    internalFreight: number;
    otherDefinitiveCosts: number;
  };
  taxRates: {
    importDuty: number;
    statisticalRate: number;
    iva: number;
    ivaAdditional: number;
    ganancias: number;
    iibb: number;
  };
  checklist: ChecklistItemState[];
}
