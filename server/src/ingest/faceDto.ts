import type { FaceDto } from '@lr/shared/api';
import type { FaceCrop } from '../faces/crop.ts';

/** Faces go to the client as data URLs, so no public face URL exists. */
export function toDto(c: FaceCrop): FaceDto {
  return {
    id: c.id,
    dataUrl: `data:image/png;base64,${c.png.toString('base64')}`,
    width: c.width,
    height: c.height,
  };
}
