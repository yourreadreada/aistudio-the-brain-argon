import React from 'react';
import {
  CaptureHubModal,
  CaptureHubModalProps,
  CaptureHubTab,
} from './CaptureHubModal';

export type IngestModalProps = CaptureHubModalProps;
export { CaptureHubModal };
export type { CaptureHubTab };

export const IngestModal: React.FC<IngestModalProps> = (props) => {
  return <CaptureHubModal {...props} />;
};
