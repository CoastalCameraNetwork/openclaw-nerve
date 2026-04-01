/**
 * Wizards hook
 *
 * Manages wizard state for all wizards.
 */

import { useState, useCallback } from 'react';

export type WizardType = 'create-feature' | 'review-pr' | 'deploy';

export function useWizards() {
  const [activeWizard, setActiveWizard] = useState<WizardType | null>(null);

  const openWizard = useCallback((wizard: WizardType) => {
    setActiveWizard(wizard);
  }, []);

  const closeWizard = useCallback(() => {
    setActiveWizard(null);
  }, []);

  return {
    activeWizard,
    openWizard,
    closeWizard,
    isOpen: (wizard: WizardType) => activeWizard === wizard,
  };
}
