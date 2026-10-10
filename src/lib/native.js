// Pricr: bridge between the web app and the native iPhone/Android shell (Capacitor).
// Every function here also works in a normal browser, so the same code ships to the web.
import { Capacitor } from '@capacitor/core'

export const isNative = () => Capacitor.isNativePlatform()

// Saves a jsPDF document. In the phone app this opens the share sheet (Save to Files,
// AirDrop, Messages, Mail...). In a browser it downloads the file as before.
export async function deliverPdf(doc, filename) {
  if (!isNative()) {
    doc.save(filename)
    return
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])
  const data = doc.output('datauristring').split(',')[1]
  const { uri } = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache })
  await Share.share({ title: filename, url: uri, dialogTitle: 'Share quote' })
}

// Native camera / photo library picker. Returns File objects (empty list if cancelled),
// so the rest of the app handles them exactly like files from a browser <input>.
export async function pickPhotos() {
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Prompt,
      promptLabelHeader: 'Add a site photo',
      promptLabelPhoto: 'Choose from library',
      promptLabelPicture: 'Take photo',
    })
    const res = await fetch(photo.webPath)
    const blob = await res.blob()
    const ext = photo.format || 'jpeg'
    return [new File([blob], `site-photo-${Date.now()}.${ext}`, { type: blob.type || `image/${ext}` })]
  } catch {
    return [] // user cancelled, or permission denied
  }
}

// Small tap feedback on the phone. No-op on the web.
export async function haptic(kind = 'light') {
  if (!isNative()) return
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics')
    if (kind === 'success') await Haptics.notification({ type: NotificationType.Success })
    else await Haptics.impact({ style: ImpactStyle.Light })
  } catch {
    // ignore
  }
}

// Call once at startup: match the status bar to the theme and drop the launch screen.
export async function initNative(theme = 'dark') {
  if (!isNative()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: theme === 'light' ? Style.Light : Style.Dark })
  } catch {
    // ignore
  }
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen')
    await SplashScreen.hide()
  } catch {
    // ignore
  }
}
