import { useRef, type RefObject } from 'react';

const fullTurn = 2 * Math.PI;
const radiansPerPixel = (0.7 * Math.PI) / 180;
const keyboardStep = Math.PI / 12;

type PickerRotationControlProps = {
  rotation: RefObject<number>;
  disabled: boolean;
};

export default function PickerRotationControl({ rotation, disabled }: PickerRotationControlProps) {
  const drag = useRef<{ pointerId: number; lastX: number } | null>(null);

  function rotateBy(delta: number) {
    rotation.current = (rotation.current + delta) % fullTurn;
  }

  function endDrag(pointerId: number) {
    if (drag.current?.pointerId === pointerId) drag.current = null;
  }

  return (
    <div
      className="showcase-rotate"
      role="group"
      aria-label="Rotate tutor preview. Use the left and right arrow keys to rotate, or Home to reset."
      aria-disabled={disabled}
      tabIndex={0}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0 || !event.isPrimary) return;
        drag.current = { pointerId: event.pointerId, lastX: event.clientX };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const active = drag.current;
        if (disabled || active?.pointerId !== event.pointerId) return;
        rotateBy((event.clientX - active.lastX) * radiansPerPixel);
        active.lastX = event.clientX;
      }}
      onPointerUp={(event) => endDrag(event.pointerId)}
      onPointerCancel={(event) => endDrag(event.pointerId)}
      onLostPointerCapture={(event) => endDrag(event.pointerId)}
      onKeyDown={(event) => {
        if (disabled || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home') return;
        event.preventDefault();
        event.stopPropagation();

        if (event.key === 'Home') rotation.current = 0;
        else rotateBy(event.key === 'ArrowLeft' ? -keyboardStep : keyboardStep);
      }}
    >
    </div>
  );
}
