// app/layout.jsx
// Root layout — wires up the manifest, mobile meta tags, and brand theme color

export const metadata = {
  title: 'Christy — Cura CCM Agent',
  description: 'CCM/RPM patient engagement gap agent for Cura Community Connections',
  manifest: '/manifest.json',
  themeColor: '#7B2442',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Christy'
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* PWA / mobile install support */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#7B2442" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Christy" />

        {/* Apple touch icons — swap src when your real logo is ready */}
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192x192.png" />

        {/* Favicon — swap when logo is ready */}
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-96x96.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-48x48.png" />
      </head>
      <body style={{ margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
