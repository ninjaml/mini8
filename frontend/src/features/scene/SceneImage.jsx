import { useState } from "react";

export function SceneImage({ src, fallback, className = "" }) {
  const [error, setError] = useState(false);
  if (error) {
    return (
      <div className={`scene-image-fallback ${className}`}>
        {fallback}
      </div>
    );
  }
  return <img src={src} alt="" className={className} onError={() => setError(true)} />;
}
