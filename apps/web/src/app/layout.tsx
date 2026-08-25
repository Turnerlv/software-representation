export const metadata = {
    title: 'Chomp Visualizer',
    description: 'Software Representation Engine',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body style={{ margin: 0, padding: 0, overflow: 'hidden' }}>
                {children}
            </body>
        </html>
    );
}