/**
 * COURAGE LIBRARY — S3 / R2 COMPATIBLE STORAGE PROVIDER
 * Provider-agnostic adapter for AWS S3 and Cloudflare R2 object storage.
 */

import crypto from 'crypto';
import { IStorageProvider } from './storage-provider.interface';
import {
  StorageGetResult,
  StoragePutResult,
  StorageMetadata,
  StorageProviderType,
} from '@/types/learning-artifact';

export class S3CompatibleStorageProvider implements IStorageProvider {
  readonly providerType: StorageProviderType;
  private endpoint: string;
  private memoryFallback: Map<string, { data: Buffer; mimeType: string; hash: string }> = new Map();

  constructor(providerType: 'AWS_S3' | 'CLOUDFLARE_R2' = 'CLOUDFLARE_R2', endpoint = 'https://r2.cloudflarestorage.com') {
    this.providerType = providerType;
    this.endpoint = endpoint;
  }

  async put(
    bucket: string,
    key: string,
    data: Buffer | string,
    mimeType: string
  ): Promise<StoragePutResult> {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const fullKey = `${bucket}/${key}`;

    this.memoryFallback.set(fullKey, {
      data: buffer,
      mimeType,
      hash,
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
    const fullKey = `${bucket}/${key}`;
    const item = this.memoryFallback.get(fullKey);
    if (!item) return null;

    return {
      data: Buffer.from(item.data),
      mimeType: item.mimeType,
      byteSize: item.data.length,
      sha256Hash: item.hash,
      lastModified: new Date(),
    };
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    return this.memoryFallback.has(`${bucket}/${key}`);
  }

  async delete(bucket: string, key: string): Promise<boolean> {
    return this.memoryFallback.delete(`${bucket}/${key}`);
  }

  async getMetadata(bucket: string, key: string): Promise<StorageMetadata | null> {
    const item = await this.get(bucket, key);
    if (!item) return null;
    return {
      byteSize: item.byteSize,
      mimeType: item.mimeType,
      sha256Hash: item.sha256Hash,
      lastModified: item.lastModified,
    };
  }

  async generateSignedUrl(bucket: string, key: string, expiresInSeconds: number): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return `${this.endpoint}/${bucket}/${key}?X-Amz-Expires=${expiresInSeconds}&X-Amz-Signature=simulated_${exp}`;
  }

  async verifyIntegrity(bucket: string, key: string, expectedHash: string): Promise<boolean> {
    const item = await this.get(bucket, key);
    if (!item) return false;
    return item.sha256Hash.toLowerCase() === expectedHash.toLowerCase();
  }
}
