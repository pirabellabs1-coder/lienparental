'use client'

import { use } from 'react'
import { ImagesPicker } from '@/components/journal/ImagesPicker'

// M05 — « Ajouter des images » à une entrée existante (tuile + du détail).
export default function EntreeImagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <ImagesPicker draftKey={id} />
}
