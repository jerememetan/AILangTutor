import type { RefObject } from 'react';
import type { Tutor } from '../data/tutors';
import VrmAvatar from './VrmAvatar';

type TutorAvatarProps = {
  tutor: Tutor;
  large?: boolean;
  showcase?: boolean;
  preloadSources?: string[];
  onPreviewReady?: (id: string) => void;
  pickerRotation?: RefObject<number>;
};

export default function TutorAvatar({
  tutor,
  large = false,
  showcase = false,
  preloadSources,
  onPreviewReady,
  pickerRotation,
}: TutorAvatarProps) {
  return (
    <div
      className={`avatar-placeholder avatar-${tutor.tone} ${large ? 'avatar-large' : ''}`}
      aria-label={`${tutor.name} 3D avatar preview`}
    >
      <div className="avatar-halo" />
      <div className="avatar-head">
        <div className="avatar-hair" />
        <div className="avatar-face">
          <span className="eye eye-left" />
          <span className="eye eye-right" />
          <span className="smile" />
        </div>
        <div className="avatar-neck" />
        <div className="avatar-shoulders" />
      </div>
      {(tutor.modelPath || showcase) && (
        <VrmAvatar
          src={tutor.modelPath}
          speaking={large}
          previewId={showcase ? tutor.id : undefined}
          preloadSources={preloadSources}
          onPreviewReady={onPreviewReady}
          pickerRotation={pickerRotation}
        />
      )}
      {large && (
        <div className="avatar-live">
          <span /> LIVE TUTOR
        </div>
      )}
    </div>
  );
}
