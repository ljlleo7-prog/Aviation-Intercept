import { useEffect, useRef } from 'react';

export function useRadarView(service, elementRef, enabled, latitude, longitude, range, heading = 0) {
  const latest = useRef();
  latest.current = { enabled, latitude, longitude, range, heading };
  useEffect(() => {
    const id = Symbol('radar view');
    const update = () => {
      const value = latest.current;
      const element = elementRef.current;
      const rect = element?.getBoundingClientRect();
      // SVG groups need their owning SVG's layout box for visibility checks.
      const visibilityElement = element?.ownerSVGElement ?? element;
      const painted = visibilityElement?.checkVisibility
        ? visibilityElement.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })
        : visibilityElement && getComputedStyle(visibilityElement).visibility !== 'hidden';
      const visible = painted && rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
      if (!value.enabled || document.hidden || !visible || !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude)) {
        service.removeView(id); return;
      }
      service.setView(id, [value.latitude, value.longitude, value.range, value.heading]);
    };
    update();
    const timer = setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); service.removeView(id); };
  }, [service, elementRef, enabled]);
}
