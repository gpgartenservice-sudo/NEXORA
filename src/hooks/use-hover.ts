import { useState } from 'react';

/** Hover-Zustand für Pressable (Maus auf dem Mac/im Browser). Auf dem Handy immer false. */
export function useHover() {
  const [hovered, setHovered] = useState(false);
  return {
    hovered,
    hoverProps: {
      onHoverIn: () => setHovered(true),
      onHoverOut: () => setHovered(false),
    },
  };
}
