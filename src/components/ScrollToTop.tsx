import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Resets scroll position to top on every route change.
// Without this, React Router keeps the previous scroll position,
// which looks like an unwanted auto-scroll (e.g. landing page -> footer)
// when navigating to a new page that happens to be shorter or differently laid out.
const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

export default ScrollToTop;
