// app/page.tsx
import Link from 'next/link';
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-green-50">
      <div className="p-8 bg-white rounded-lg shadow-md text-center">
        <h1 className="text-4xl font-bold mb-8">Bienvenue sur notre messagerie</h1>
        <div className="space-y-4">
          <Link href="/login" className="block">
            <Button className="w-full bg-emerald-200 hover:bg-emerald-300 text-black">
              Se connecter
            </Button>
          </Link>
          <Link href="/signup" className="block">
            <Button className="w-full bg-emerald-200 hover:bg-emerald-300 text-black">
              S'inscrire
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
