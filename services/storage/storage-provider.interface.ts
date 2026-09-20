/**
 * COURAGE LIBRARY — STORAGE PROVIDER INTERFACE
 * Provider-agnostic abstraction for Object / Blob storage.
 */

import {
  StorageGetResult,
  StoragePutResult,
  StorageMetadata,
  StorageProviderType,
} from '@/types/learning-artifact';

export interface IStorageProvider {
  readonly providerType: StorageProviderType;

  put(
    bucket: string,
    key: string,
    data: Buffer | string,
    mimeType: string
  ): Promise<StoragePutResult>;

  get(bucket: string, key: string): Promise<StorageGetResult | null>;

  exists(bucket: string, key: string): Promise<boolean>;

  delete(bucket: string, key: string): Promise<boolean>;

  getMetadata(bucket: string, key: string): Promise<StorageMetadata | null>;

  generateSignedUrl(
    bucket: string,
    key: string,
    expiresInSeconds: number
  ): Promise<string>;

  verifyIntegrity(
    bucket: string,
    key: string,
    expectedHash: string
  ): Promise<boolean>;
}
