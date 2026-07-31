'use client';

import { useState } from 'react';
import { cn, initialOf } from '@/lib/utils';

/**
 * Account photo with an initial as its fallback. The photo comes from
 * /api/photo/<personId>, which answers 404 for anyone the Users Service has no
 * picture of — so the initial is rendered underneath and simply shows through
 * once the image fails (or while it is still loading).
 */
export function Avatar({
  src,
  name,
  className,
  alt,
}: {
  src?: string | null;
  /** ชื่อจริง preferred; a full name works too — the คำนำหน้า is stripped. */
  name: string;
  className?: string;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-full',
        className,
      )}
    >
      {initialOf(name)}
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- proxied, not optimizable
        <img
          src={src}
          alt={alt ?? name}
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );
}
