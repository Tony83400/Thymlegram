// app/page.tsx
import Link from 'next/link';
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <h1 className="text-4xl font-bold mb-8">Bienvenue sur notre messagerie</h1>
      <Link href="/login">
        <Button className="mb-4">Se connecter</Button>
      </Link>
      <Link href="/signup">
        <Button variant="outline">S'inscrire</Button>
      </Link>
    </div>
  );
}
