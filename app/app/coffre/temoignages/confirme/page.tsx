'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { SuccessBurst } from '@/components/coffre/Illustrations'
import { btn } from '@/components/coffre/buttons'

// Maquette « 9. Témoignage confirmé »
export default function TemoignageConfirmePage() {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { headingRef.current?.focus() }, [])

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-md flex-col items-center justify-center px-6 py-10 text-center">
      <SuccessBurst />
      <h1 ref={headingRef} tabIndex={-1} className="mt-3 text-[21px] font-extrabold text-leaf-600 outline-none">
        Témoignage confirmé !
      </h1>
      <p className="mt-2 max-w-[270px] text-[14px] leading-relaxed text-night-600">
        Ce témoignage a été validé et est maintenant stocké dans votre coffre-fort.
      </p>
      <Link href="/app/coffre/temoignages?tab=termine" className={`${btn({ variant: 'primary' })} mt-10`}>
        Voir tous mes témoignages
      </Link>
    </div>
  )
}
