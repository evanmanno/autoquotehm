// The app's name and public contact details, kept in ONE place.
//
// To rename the app, don't edit this by hand. From the project folder run:
//   node scripts/rename-app.mjs "NewName" [new-support-email]
// It updates this file plus every place outside the code that shows the name:
// the browser tab title, the home-screen name, the iPhone/Android app name,
// the iPhone permission messages and the privacy/terms/support pages.
// (Translations keep saying "Pricr" in their text; tr() swaps in APP_NAME.)
export const APP_NAME = 'Pricr'
export const SUPPORT_EMAIL = 'info@pricr.com'

// Replaces the original name inside any piece of text with the current one.
export const withAppName = (text) =>
  APP_NAME === 'Pricr' || typeof text !== 'string' ? text : text.replace(/Pricr/g, APP_NAME)
