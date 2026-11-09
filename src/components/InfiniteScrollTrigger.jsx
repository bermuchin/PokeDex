import { useEffect, useRef } from 'react';

function InfiniteScrollTrigger({ onIntersect, enabled }) {
  const targetRef = useRef(null);

  useEffect(() => {
    if (!enabled || !targetRef.current) return undefined;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) onIntersect();
    }, { rootMargin: '400px' });

    observer.observe(targetRef.current);
    return () => observer.disconnect();
  }, [enabled, onIntersect]);

  return <div ref={targetRef} aria-hidden="true" style={{ height: 1 }} />;
}

export default InfiniteScrollTrigger;
