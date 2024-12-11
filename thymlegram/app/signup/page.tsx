'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../supabaseClient';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkUsernameAvailability = async () => {
      if (username.length < 3) {
        setUsernameStatus("Le nom d'utilisateur doit contenir au moins 3 caractères");
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', username)
          .single();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        setUsernameStatus(data ? "Ce nom d'utilisateur est déjà pris" : "Nom d'utilisateur disponible");
      } catch (error) {
        console.error("Erreur lors de la vérification du nom d'utilisateur:", error);
        setUsernameStatus("Erreur lors de la vérification");
      }
    };

    const debounceTimer = setTimeout(() => {
      if (username) {
        checkUsernameAvailability();
      }
    }, 300); // Délai de 300ms pour éviter trop de requêtes

    return () => clearTimeout(debounceTimer);
  }, [username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    try {
      if (usernameStatus !== "Nom d'utilisateur disponible") {
        throw new Error("Veuillez choisir un nom d'utilisateur valide et disponible");
      }

      const { data: signupData, error: signupError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signupError) throw signupError;

      if (!signupData.user) {
        throw new Error("Erreur lors de la création du compte");
      }

      const { error: profileError } = await supabase.from('profiles').insert([
        {
          id: signupData.user.id,
          username,
        },
      ]);

      if (profileError) throw profileError;

      router.push('/login');
    } catch (error: any) {
      setErrorMessage(error.message || "Une erreur est survenue lors de la création du compte");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={handleSubmit} className="p-8 bg-white rounded-lg shadow-md w-96">
        <h2 className="text-2xl font-bold mb-6 text-center">Créer un compte</h2>
        {errorMessage && (
          <p className="text-red-500 text-sm mb-4">{errorMessage}</p>
        )}
        <div className="mb-4">
          <Input
            type="text"
            placeholder="Nom d'utilisateur"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full"
            required
          />
          {usernameStatus && (
            <p className={`text-sm ${usernameStatus === "Nom d'utilisateur disponible" ? "text-green-500" : "text-red-500"}`}>
              {usernameStatus}
            </p>
          )}
        </div>
        <div className="mb-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full"
            required
          />
        </div>
        <div className="mb-6">
          <Input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full"
            required
          />
        </div>
        <Button 
          type="submit" 
          className="w-full" 
          disabled={isLoading || usernameStatus !== "Nom d'utilisateur disponible"}
        >
          {isLoading ? "Création en cours..." : "Créer un compte"}
        </Button>
      </form>
    </div>
  );
}