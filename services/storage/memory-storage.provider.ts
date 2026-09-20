/**
 * COURAGE LIBRARY — IN-MEMORY STORAGE PROVIDER
 * Hermetic, isolated storage provider for unit tests and local simulation.
 */

import crypto from 'crypto';
import { IStorageProvider } from './storage-provider.interface';
import {
  StorageGetResult,
  StoragePutResult,
  StorageMetadata,
  StorageProviderType,
} from '@/types/learning-artifact';

export class MemoryStorageProvider implements IStorageProvider {
  readonly providerType: StorageProviderType = 'MEMORY';
  private static globalStorage: Map<string, { data: Buffer; mimeType: string; hash: string; lastModified: Date }> = new Map();

  private get storage() {
    return MemoryStorageProvider.globalStorage;
  }

  static clearGlobalStorage(): void {
    MemoryStorageProvider.globalStorage.clear();
  }

  private getFullKey(bucket: string, key: string): string {
    return `${bucket}/${key}`;
  }

  async put(
    bucket: string,
    key: string,
    data: Buffer | string,
    mimeType: string
  ): Promise<StoragePutResult> {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const fullKey = this.getFullKey(bucket, key);

    this.storage.set(fullKey, {
      data: buffer,
      mimeType,
      hash,
      lastModified: new Date(),
    });

    return {
      bucket,
      key,
      byteSize: buffer.length,
      sha256Hash: hash,
      provider: this.providerType,
    };
  }

  async get(bucket: string, key: string): Promise<StorageGetResult | null> {
    const fullKey = this.getFullKey(bucket, key);
    const item = this.storage.get(fullKey);
    if (!item) return null;

    return {
      data: Buffer.from(item.data),
      mimeType: item.mimeType,
      byteSize: item.data.length,
      sha256Hash: item.hash,
      lastModified: item.lastModified,
    };
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    return this.storage.has(this.getFullKey(bucket, key));
  }

  async delete(bucket: string, key: string): Promise<boolean> {
    return this.storage.delete(this.getFullKey(bucket, key));
  }

  async getMetadata(bucket: string, key: string): Promise<StorageMetadata | null> {
    const fullKey = this.getFullKey(bucket, key);
    const item = this.storage.get(fullKey);
    if (!item) return null;

    return {
      byteSize: item.data.length,
      mimeType: item.mimeType,
      sha256Hash: item.hash,
      lastModified: item.lastModified,
    };
  }

  async generateSignedUrl(bucket: string, key: string, expiresInSeconds: number): Promise<string> {
    const fullKey = this.getFullKey(bucket, key);
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return `https://storage.local.couragelibrary.internal/${fullKey}?token=simulated_sig_${exp}`;
  }

  async verifyIntegrity(bucket: string, key: string, expectedHash: string): Promise<boolean> {
    const item = await this.get(bucket, key);
    if (!item) return false;
    return item.sha256Hash.toLowerCase() === expectedHash.toLowerCase();
  }

  clear(): void {
    this.storage.clear();
  }
}
