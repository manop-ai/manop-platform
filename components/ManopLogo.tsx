'use client'

import Image from 'next/image'
import React from 'react'

interface LogoProps {
  height?: number
  dark?: boolean
  iconOnly?: boolean
  className?: string
  style?: React.CSSProperties
  priority?: boolean
}

export default function ManopLogo({
  height,
  dark = true,
  iconOnly = false,
  className,
  style,
  priority = false,
}: LogoProps) {

  const defaultHeight = iconOnly ? 56 : 80
  const finalHeight = height ?? defaultHeight

  const src = iconOnly
    ? dark
      ? '/logos/manop-icon-mono.svg'
      : '/logos/manop-icon-color.svg'
    : dark
      ? '/logos/manop-full-dark.svg'
      : '/logos/manop-full-light.svg'

  const aspectRatio = iconOnly ? 1 : 5.4

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