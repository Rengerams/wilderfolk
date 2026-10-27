/** Persisted historical genealogy data. Kept independent of simulation modules to avoid runtime cycles. */
export interface GenealogyPerson {
  id: number;
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
