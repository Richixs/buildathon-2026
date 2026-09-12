"use client";

import { type ReactNode } from "react";
import { useAccount } from "wagmi";
import { useCheckProfile } from "@/hooks/use-profile";
import RegistrationForm, {
  type RegistrationFormValues,
} from "@/components/profile/RegistrationForm";
import ConnectButton from "@/components/web3/ConnectButton";

function TerminalLoader() {
  return (
    <div className="border-neon-cyan/40 bg-terminal-gray mx-auto flex w-full max-w-sm flex-col items-center gap-4 border-2 p-8">
      <p className="text-neon-cyan font-mono text-sm tracking-widest">
        VERIFICANDO_PERFIL
        <span className="animate-pulse">_</span>
      </p>
      <div className="border-neon-cyan/30 bg-crt-black relative h-2 w-full overflow-hidden border">
        <div className="bg-neon-cyan animate-scan absolute h-full w-[30%]" />
      </div>
    </div>
  );
}

function ConnectPrompt() {
  return (
    <div className="border-neon-cyan/40 bg-terminal-gray mx-auto flex w-full max-w-sm flex-col items-center gap-4 border-2 p-8 text-center">
      <p className="text-off-white/70 font-mono text-sm">
        &gt; CONECTA TU WALLET PARA VER TU PERFIL_
      </p>
      <ConnectButton />
    </div>
  );
}

export default function ProfileGuard({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const { data: profile, isLoading, createProfile } = useCheckProfile(address);

  if (!isConnected || !address) {
    return <ConnectPrompt />;
  }

  if (isLoading) {
    return <TerminalLoader />;
  }

  if (!profile) {
    async function handleRegister(values: RegistrationFormValues) {
      await createProfile({
        username: values.alias,
        bio: values.bio,
        role: values.role,
        legalName: values.legalName,
      });
    }

    return <RegistrationForm onSubmit={handleRegister} />;
  }

  return <>{children}</>;
}
