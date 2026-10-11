import { QRCodeSVG } from 'qrcode.react'
import { joinPageUrl } from '@/lib/joinLink'
import { cn } from '@/lib/utils'

/**
 * Scan-to-join (Decision #77): opens /join with this game's code already
 * filled in, so a player only picks a name and avatar. Always dark modules
 * on a white quiet zone, whatever the theme, since that's what phone
 * cameras read best. Size it with a `size-*` class.
 */
export function JoinQrCode({ joinCode, className }: { joinCode: string; className?: string }) {
  return (
    <QRCodeSVG
      value={joinPageUrl(joinCode)}
      level="M"
      marginSize={2}
      bgColor="#ffffff"
      fgColor="#0e1118"
      title={`QR code to join game ${joinCode}`}
      className={cn('size-40 rounded-xl', className)}
    />
  )
}
