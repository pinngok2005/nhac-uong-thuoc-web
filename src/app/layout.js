import './globals.css';

export const metadata = {
  title: 'Lịch Uống Thuốc',
  description: 'Nhắc lịch uống thuốc 5 khung giờ',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Uống Thuốc',
  },
};

export const viewport = {
  themeColor: '#0D9488',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body className="bg-[#F4F6F9] text-slate-900 antialiased select-none">
        {children}
      </body>
    </html>
  );
}