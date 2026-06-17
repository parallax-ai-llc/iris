'use client';

import { useState, useEffect, useCallback } from 'react';
import { PanelState } from '../types';

const MD_BREAKPOINT = 768;

export function useMobilePanel() {
  const [isMobile, setIsMobile] = useState(false);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Detect mobile screen and adjust panel states
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < MD_BREAKPOINT;
      setIsMobile(mobile);
      return mobile;
    };

    // Initial check - close panels on mobile
    if (checkMobile()) {
      setShowLeftPanel(false);
      setShowRightPanel(false);
    }

    const handleResize = () => {
      const mobile = checkMobile();
      if (mobile) {
        setShowLeftPanel(false);
        setShowRightPanel(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mobile panel toggle - only one panel open at a time
  const toggleLeftPanel = useCallback(() => {
    if (isMobile) {
      setShowLeftPanel((prev) => !prev);
      if (!showLeftPanel) setShowRightPanel(false);
    } else {
      setShowLeftPanel((prev) => !prev);
    }
  }, [isMobile, showLeftPanel]);

  const toggleRightPanel = useCallback(() => {
    if (isMobile) {
      setShowRightPanel((prev) => !prev);
      if (!showRightPanel) setShowLeftPanel(false);
    } else {
      setShowRightPanel((prev) => !prev);
    }
  }, [isMobile, showRightPanel]);

  const closePanels = useCallback(() => {
    setShowLeftPanel(false);
    setShowRightPanel(false);
  }, []);

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  return {
    isMobile,
    showLeftPanel,
    showRightPanel,
    mobileMenuOpen,
    toggleLeftPanel,
    toggleRightPanel,
    closePanels,
    toggleMobileMenu,
    closeMobileMenu,
    setShowLeftPanel,
    setShowRightPanel,
  };
}
