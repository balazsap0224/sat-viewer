// Keeps the globe in the part of the screen that panels do not cover (phone layout, module 8).
//
// On a phone, the sheet can cover the lower half of the screen (or, held sideways, a column on
// the left). Instead of moving the camera, which would change what the globe looks like, the
// picture itself is slid: three's `setViewOffset` renders the window as a cut-out of a larger
// virtual picture, so the same view appears centred on the free area. Picking and labels use
// the camera's projection matrix, which includes the offset, so they stay correct.

/** Screen edges covered by panels [CSS px]. Written by the phone layout, read every frame. */
export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const viewInsets: Insets = { top: 0, bottom: 0, left: 0, right: 0 };

/** Replaces the covered edges (all zero on desktop). */
export function setViewInsets(next: Insets): void {
  Object.assign(viewInsets, next);
}

/**
 * The view offset [px] that centres the picture on the uncovered area.
 *
 * The free area's centre is (left − right) / 2 right of and (top − bottom) / 2 below the
 * window's centre. Sliding the cut-out window by +d over the virtual picture moves what is
 * shown by −d, so the offset is the opposite: x = (right − left) / 2, y = (bottom − top) / 2.
 */
export function viewOffsetFor(insets: Insets): { x: number; y: number } {
  return { x: (insets.right - insets.left) / 2, y: (insets.bottom - insets.top) / 2 };
}
