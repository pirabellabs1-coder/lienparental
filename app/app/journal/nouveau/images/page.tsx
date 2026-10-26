'use client'

import { ImagesPicker } from '@/components/journal/ImagesPicker'

// M05 — « Ajouter des images » depuis le formulaire de création.
export default function NouvelleEntreeImagesPage() {
  return <ImagesPicker draftKey="nouveau" />
}
