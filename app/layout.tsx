import './globals.css';
export const metadata = { title: 'SiteSignal Audit', description: 'Automated website SEO & UX audit pipeline' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
