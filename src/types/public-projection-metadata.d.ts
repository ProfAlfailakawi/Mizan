import './index';

declare module './index' {
  interface Competition {
    /**
     * Revision timestamp of the published/public projection when a competition is read through
     * that projection. Authoritative competition records do not have to carry this metadata,
     * therefore it is intentionally optional.
     */
    updatedAt?: string;
  }
}
