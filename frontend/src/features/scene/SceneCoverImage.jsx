import { useEffect, useState, useRef } from "react";

export function SceneCoverImage({ src, fallback, className = "" }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [error, setError] = useState(false);
  const blobUrlRef = useRef(null);

  useEffect(() => {
    if (!src) {
      setError(true);
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setBlobUrl(null);
      return;
    }

    setError(false);
    let cancelled = false;

    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setBlobUrl(url);
      })
      .catch(() => {
        if (cancelled) return;
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = null;
        }
        setBlobUrl(null);
        setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  if (error || !blobUrl) {
    return (
      <div className={`scene-image-fallback ${className}`}>
        {fallback}
      </div>
    );
  }

  return <img src={blobUrl} alt="" className={className} />;
}
