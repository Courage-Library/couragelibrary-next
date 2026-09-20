/**
 * COURAGE LIBRARY — SUPABASE STORAGE PROVIDER
 * Server-side storage adapter connecting to Supabase Storage Buckets.
 */

import crypto from 'crypto';
import path from 'path';
import { IStorageProvider } from './storage-provider.interface';
import {
  StorageGetResult,
  StoragePutResult,
  StorageMetadata,
  StorageProviderType,
} from '@/types/learning-artifact';

export class SupabaseStorageProvider implements IStorageProvider {
  readonly providerType: StorageProviderType = 'SUPABASE_STORAGE';
  private supabaseClient: any;

  constructor(supabaseClient: any) {
    this.supabaseClient = supabaseClient;
  }

  async put(
    bucket: string,
    key: string,
    data: Buffer | string,
    mimeType: string
  ): Promise<StoragePutResult> {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    const { error } = await this.supabaseClient.storage
      .from(bucket)
      .upload(key, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      throw new Error(`Supabase Storage upload failed for ${bucket}/${key}: ${error.message}`);
    }

    return {
      bucket,
      key,
      byteSize: buffer.length,
      sha256Hash: hash,
      provider: this.providerType,
    };
  }

  async get(bucket: string, key: string): Promise<StorageGetResult | null> {
    const { data, error } = await this.supabaseClient.storage
      .from(bucket)
      .download(key);

    if (error || !data) return null;

    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    return {
      data: buffer,
      mimeType: data.type || 'application/octet-stream',
      byteSize: buffer.length,
      sha256Hash: hash,
      lastModified: new Date(),
    };
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    const { data, error } = await this.supabaseClient.storage
      .from(bucket)
      .list(path.dirname(key) === '.' ? '' : path.dirname(key), {
        search: path.basename(key),
      });

    if (error || !data) return false;
    return data.some((f: any) => f.name === path.basename(key));
  }

  async delete(bucket: string, key: string): Promise<boolean> {
    const { error } = await this.supabaseClient.storage
      .from(bucket)
      .remove([key]);

    return !error;
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
    const { data, error } = await this.supabaseClient.storage
      .from(bucket)
      .createSignedUrl(key, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new Error(`Failed to generate signed URL for ${bucket}/${key}: ${error?.message || 'Unknown error'}`);
    }
    return data.signedUrl;
  }

  async verifyIntegrity(bucket: string, key: string, expectedHash: string): Promise<boolean> {
    const item = await this.get(bucket, key);
    if (!item) return false;
    return item.sha256Hash.toLowerCase() === expectedHash.toLowerCase();
  }
}
