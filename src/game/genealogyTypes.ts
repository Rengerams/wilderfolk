/** Persisted historical genealogy data. Kept independent of simulation modules to avoid runtime cycles. */
import type { EntityType } from './gameTypes';
export interface GenealogyPerson {
  id: number;
  /** Undefined in old saves and for ordinary human relatives. */
  entityType?: EntityType;
  /** Wildkin born to two Wildkin do not have assigned male/female parent roles. */
  wildkinParentIds?: number[];
  name: string;
  birthSurname: string;
  surname: string;
  gender?: 'male' | 'female';
  bornYear?: number;
  bornDay?: number;
  diedYear?: number;
  diedDay?: number;
  alive: boolean;
  motherId?: number;
  fatherId?: number;
  adoptiveMotherId?: number;
  adoptiveFatherId?: number;
  partners: number[];
  childrenIds: number[];
}
export interface GenealogyRegistry {
  people: Record<string, GenealogyPerson>;
}
