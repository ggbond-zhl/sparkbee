export type CredentialType = "rfid" | "app" | "emaid" | "local-list" | "other";

export interface Credential {
  id: string;
  value: string;
  type: CredentialType;
  issuer?: string;
  isPrimary?: boolean;
  extraIds?: string[];
}
