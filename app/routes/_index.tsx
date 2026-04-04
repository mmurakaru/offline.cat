export function meta() {
  return [
    { title: "offline.cat" },
    { name: "description", content: "Translate documents offline. No servers. No accounts. No exceptions." },
  ];
}

export default function Home() {
  return (
    <main className="flex items-center justify-center min-h-screen">
      <h1 className="text-4xl font-bold">offline.cat</h1>
    </main>
  );
}
