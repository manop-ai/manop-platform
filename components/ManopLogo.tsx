'use client'

import Image from 'next/image'
import React from 'react'

interface LogoProps {
  height?: number
  dark?: boolean
  iconOnly?: boolean
  /** Use the tightly-cropped wordmark (no blank canvas), so `height` is the real visible height. Used by the header and footer. */
  tight?: boolean
  className?: string
  style?: React.CSSProperties
  priority?: boolean
}

export default function ManopLogo({
  height,
  dark = true,
  iconOnly = false,
  tight = false,
  className,
  style,
  priority = false,
}: LogoProps) {

  const defaultHeight = iconOnly ? 56 : 80
  const finalHeight = height ?? defaultHeight

  const src = tight && !iconOnly
    ? (dark ? '/logos/manop-wordmark-dark.svg' : '/logos/manop-wordmark-light.svg')
    : iconOnly
    ? dark
      ? '/logos/manop-icon-mono.svg'
      : '/logos/manop-icon-color.svg'
    : dark
      ? '/logos/manop-full-dark.svg'
      : '/logos/manop-full-light.svg'

  const aspectRatio = iconOnly ? 1 : tight ? 3.49 : 5.4

  return (
    <Image
      src={src}
      alt="MANOP"
      width={Math.round(finalHeight * aspectRatio)}
      height={finalHeight}
      priority={priority}
      className={className}
      style={{
        width: 'auto',
        height: `${finalHeight}px`,
        objectFit: 'contain',
        display: 'block',
        flexShrink: 0,
        userSelect: 'none',
        ...style,
      }}
    />
  )
}

export type ManopLogoSVGProps = Omit<LogoProps, 'iconOnly'> & {
  showText?: boolean
}

export function ManopLogoSVG({
  showText = true,
  ...props
}: ManopLogoSVGProps) {
  return <ManopLogo iconOnly={!showText} {...props} />
}
