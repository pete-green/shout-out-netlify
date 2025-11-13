import { useMediaQuery } from './useMediaQuery';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface DeviceTypeInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  deviceType: DeviceType;
  isTouchDevice: boolean;
}

/**
 * Breakpoints (mobile-first approach):
 * - Mobile: < 640px
 * - Tablet: 640px - 1023px
 * - Desktop: >= 1024px
 */
export function useDeviceType(): DeviceTypeInfo {
  const isTabletOrLarger = useMediaQuery('(min-width: 640px)');
  const isDesktopOrLarger = useMediaQuery('(min-width: 1024px)');

  // Detect touch device
  const isTouchDevice = typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  const isMobile = !isTabletOrLarger;
  const isTablet = isTabletOrLarger && !isDesktopOrLarger;
  const isDesktop = isDesktopOrLarger;

  const deviceType: DeviceType = isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop';

  return {
    isMobile,
    isTablet,
    isDesktop,
    deviceType,
    isTouchDevice,
  };
}

/**
 * Simple hook that returns true if device is mobile
 * Useful for quick conditional rendering
 */
export function useIsMobile(): boolean {
  return !useMediaQuery('(min-width: 640px)');
}

/**
 * Hook that returns true if device is mobile or tablet
 * Useful for touch-optimized interfaces
 */
export function useIsMobileOrTablet(): boolean {
  return !useMediaQuery('(min-width: 1024px)');
}
