/**
 * COURAGE LIBRARY — STORAGE FACTORY
 * Resolves appropriate IStorageProvider based on configuration or runtime requirement.
 */

import { IStorageProvider } from './storage-provider.interface';
import { MemoryStorageProvider } from './memory-storage.provider';
import { SupabaseStorageProvider } from './supabase-storage.provider';
import { S3CompatibleStorageProvider } from './s3-storage.provider';
import { StorageProviderType } from '@/types/learning-artifact';

export class StorageFactory {
  private static defaultProvider: IStorageProvider | null = null;

  static getProvider(type: StorageProviderType = 'MEMORY', supabaseClient?: any): IStorageProvider {
    switch (type) {
      case 'MEMORY':
        return new MemoryStorageProvider();
      case 'SUPABASE_STORAGE':
        if (!supabaseClient) {
          throw new Error('Supabase client required to instantiate SupabaseStorageProvider');
        }
        return new SupabaseStorageProvider(supabaseClient);
      case 'AWS_S3':
        return new S3CompatibleStorageProvider('AWS_S3');
      case 'CLOUDFLARE_R2':
        return new S3CompatibleStorageProvider('CLOUDFLARE_R2');
      case 'LOCAL_STORAGE':
        return new MemoryStorageProvider();
      default:
        return new MemoryStorageProvider();
    }
  }

  static getDefaultProvider(): IStorageProvider {
    if (!this.defaultProvider) {
      this.defaultProvider = new MemoryStorageProvider();
    }
    return this.defaultProvider;
  }

  static setDefaultProvider(provider: IStorageProvider): void {
    this.defaultProvider = provider;
  }
}
