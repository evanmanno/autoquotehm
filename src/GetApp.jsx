import { appStoreLinks, devicePlatform } from './lib/appUrl'
import { isNative } from './lib/native'
import { tr } from './lib/i18n'

// "Download the app" card for people who were just invited. Shows the store
// that matches their phone (both on a computer). Renders nothing inside the
// app itself or until at least one store link has been set up.
export default function GetApp({ compact = false }) {
  if (isNative()) return null
  const { ios, android } = appStoreLinks()
  if (!ios && !android) return null
  const platform = devicePlatform()
  const showIos = ios && (platform !== 'android' || !android)
  const showAndroid = android && (platform !== 'ios' || !ios)
  return (
    <div className={`get-app ${compact ? 'compact' : ''}`}>
      <h3>{tr('Download the Pricr app')}</h3>
      <p>{tr('Quote faster on your phone. Open the app and sign up with the email you were invited at.')}</p>
      <div className="get-app-buttons">
        {showIos && (
          <a className="btn primary" href={ios} target="_blank" rel="noopener noreferrer">
            {tr('Download on the App Store')}
          </a>
        )}
        {showAndroid && (
          <a className="btn primary" href={android} target="_blank" rel="noopener noreferrer">
            {tr('Get it on Google Play')}
          </a>
        )}
      </div>
    </div>
  )
}
