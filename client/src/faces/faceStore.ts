import type { FaceDto } from '@lr/shared/api';

export interface FaceEntry {
  /** Server face id (SHA-256 of the crop bytes). Never changes for the life of the store. */
  id: string;
  bitmap: ImageBitmap;
  srcWidth: number;
  srcHeight: number;
  origin: 'site' | 'upload';
}

/** In-memory faces for the visit. Nothing is persisted (D-2). */
export class FaceStore {
  private readonly byId = new Map<string, FaceEntry>();

  get faces(): FaceEntry[] {
    return [...this.byId.values()];
  }

  get size(): number {
    return this.byId.size;
  }

  /**
   * Adds faces. A known id is kept as it is (uploads add to site faces, I-2). A face that does not
   * decode is skipped, so one bad entry cannot stop the run.
   */
  async addDtos(dtos: readonly FaceDto[], origin: FaceEntry['origin']) {
    for (const dto of dtos) {
      if (this.byId.has(dto.id) || !dto.dataUrl.startsWith('data:image/')) continue;
      try {
        const blob = await (await fetch(dto.dataUrl)).blob();
        const bitmap = await createImageBitmap(blob);
        this.byId.set(dto.id, {
          id: dto.id,
          bitmap,
          srcWidth: bitmap.width,
          srcHeight: bitmap.height,
          origin,
        });
      } catch {
        // Skip it.
      }
    }
  }

  clear() {
    for (const f of this.byId.values()) f.bitmap.close();
    this.byId.clear();
  }

  sortedIds(): string[] {
    return [...this.byId.keys()].sort();
  }
}
