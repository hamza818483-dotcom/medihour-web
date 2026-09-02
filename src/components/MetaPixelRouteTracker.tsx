import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { initMetaPixel, trackPixelEvent, captureUtmParams } from "@/lib/metaPixel";

// Fires Meta Pixel PageView on the initial load and on every subsequent
// client-side route change (React Router doesn't cause a full page reload,
// so the Pixel's own auto-PageView-on-script-load only covers the first hit).
const MetaPixelRouteTracker = () => {
  const { pathname, search } = useLocation();
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initMetaPixel();
      initialized.current = true;
    } else {
      // Re-capture UTM params in case the user landed on a new page with a
      // fresh ad click (e.g. clicking another ad in the same session).
      captureUtmParams();
    }
    trackPixelEvent("PageView");
  }, [pathname, search]);

  return null;
};

export default MetaPixelRouteTracker;
